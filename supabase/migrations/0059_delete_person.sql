-- 0059 — Deleting a person from the office.
--
-- The People page could add a guide, trekker or office account and never take
-- one away. Test signups, duplicates, and people who ask to be removed all
-- stayed in the list forever, because a bare `delete from users` fails on the
-- first table that points at them — and fifty tables do.
--
-- Two rules decide what deletion means here:
--
--   1. Somebody with a trip on the books is never deleted. Bookings, payouts
--      and contracts are money and legal records; a guide with history is set
--      to "removed" or "suspended" instead, and a trekker with history stays.
--      The function refuses and says why, so the office sees the reason.
--
--   2. Everything else about them goes, and the trail of things they *did* to
--      other people's records stays. Their own rows (profile, guide record,
--      listings, enquiries, messages, reviews, groups, signups) are deleted,
--      walking the foreign keys generically so a table added next month is
--      handled without anyone remembering to add it here. Where a row merely
--      records that they acted — verified a check, issued a strike, opened an
--      incident, edited a listing, viewed a passport — the row survives with
--      the actor blanked. Five of those columns were NOT NULL; they no longer
--      are, because "somebody who has since been removed did this" is a fact
--      worth keeping.
--
-- The auth account and the files in the private documents bucket are removed
-- by the app after this succeeds (see app/lib/people.server.ts); neither can
-- be reached from SQL.

-- ---------------------------------------------------------------------------
-- 1. "Who did this" columns may outlive the person.
-- ---------------------------------------------------------------------------

alter table guide_strikes alter column issued_by drop not null;
alter table guide_strikes drop constraint if exists guide_strikes_issued_by_fkey;
alter table guide_strikes
  add constraint guide_strikes_issued_by_fkey
  foreign key (issued_by) references users(id) on delete set null;

alter table document_access_log alter column accessed_by drop not null;
alter table document_access_log drop constraint if exists document_access_log_accessed_by_fkey;
alter table document_access_log
  add constraint document_access_log_accessed_by_fkey
  foreign key (accessed_by) references users(id) on delete set null;

alter table incidents alter column opened_by drop not null;
alter table incidents drop constraint if exists incidents_opened_by_fkey;
alter table incidents
  add constraint incidents_opened_by_fkey
  foreign key (opened_by) references users(id) on delete set null;

alter table offering_edits alter column editor_id drop not null;
alter table offering_edits drop constraint if exists offering_edits_editor_id_fkey;
alter table offering_edits
  add constraint offering_edits_editor_id_fkey
  foreign key (editor_id) references users(id) on delete set null;

alter table guide_documents alter column uploaded_by drop not null;
alter table guide_documents drop constraint if exists guide_documents_uploaded_by_fkey;
alter table guide_documents
  add constraint guide_documents_uploaded_by_fkey
  foreign key (uploaded_by) references users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Remove every row that points at one row, following the schema itself.
-- ---------------------------------------------------------------------------
--
-- For each foreign key that references (p_table.p_col): a key declared
-- `on delete cascade` deletes its rows, as the schema already promised; a
-- nullable column is blanked, unless a check constraint says the row cannot
-- stand without it (an access-log line about a deleted passport has nothing
-- left to be about), in which case the row goes; a required column means the
-- referencing rows belong to this person and are deleted — after their own
-- dependants are, by recursing on each row's uuid primary key. Tables with a
-- composite key cannot themselves be referenced by a single-column foreign
-- key, so they are simply deleted.

create or replace function ops_purge_references(p_table regclass, p_col name, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fk record;
  pk_col name;
  child uuid;
begin
  for fk in
    select c.conrelid::regclass as tbl,
           a.attname as col,
           a.attnotnull as required,
           c.confdeltype = 'c' as cascades
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = p_table
      and fa.attname = p_col
      and array_length(c.conkey, 1) = 1
  loop
    if not fk.required and not fk.cascades then
      begin
        execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col)
          using p_id;
        continue;
      exception when check_violation then
        -- Fall through: the row only made sense pointing at what is going.
        null;
      end;
    end if;

    select a.attname into pk_col
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = fk.tbl
      and i.indisprimary
      and array_length(i.indkey, 1) = 1
      and a.atttypid = 'uuid'::regtype;

    if pk_col is not null then
      for child in execute format('select %I from %s where %I = $1', pk_col, fk.tbl, fk.col)
        using p_id
      loop
        perform ops_purge_references(fk.tbl, pk_col, child);
      end loop;
    end if;

    execute format('delete from %s where %I = $1', fk.tbl, fk.col) using p_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The one call the app makes.
-- ---------------------------------------------------------------------------
--
-- Returns {ok: true, name, role} or {ok: false, reason, ...counts}. Refusing is
-- a return value rather than an exception so the office gets a sentence, not a
-- stack trace, and so nothing is half-done: the counts are checked before a
-- single row moves, and the whole walk is one transaction.

create or replace function ops_delete_person(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_bookings int;
  v_payouts int;
  v_contracts int;
begin
  select role, full_name into v_role, v_name from users where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select count(*) into v_bookings
    from bookings where trekker_id = p_user_id or guide_id = p_user_id;
  select count(*) into v_payouts from payouts where guide_id = p_user_id;
  select count(*) into v_contracts from contracts where guide_id = p_user_id;

  if v_bookings + v_payouts + v_contracts > 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'has_history',
      'name', v_name,
      'role', v_role,
      'bookings', v_bookings,
      'payouts', v_payouts,
      'contracts', v_contracts
    );
  end if;

  perform ops_purge_references('users'::regclass, 'id', p_user_id);
  delete from users where id = p_user_id;

  return jsonb_build_object('ok', true, 'name', v_name, 'role', v_role);
end;
$$;

-- Service role only. The app calls this with the admin client after
-- requireOps; nobody signed in through the browser can reach it.
revoke all on function ops_purge_references(regclass, name, uuid) from public, anon, authenticated;
revoke all on function ops_delete_person(uuid) from public, anon, authenticated;
grant execute on function ops_delete_person(uuid) to service_role;

-- 0069 — Close direct authenticated write/read paths found in the launch audit.
-- Application routes use the service role after their own authorization, but
-- browser clients can also call PostgREST directly. These invariants therefore
-- live in PostgreSQL, at the shared boundary.

-- Users may edit their profile, never their authority. A new direct self-row
-- can only start as a trekker; guide and ops creation remains service-owned.
create or replace function public.guard_user_authority()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role', 'supabase_admin', 'postgres') or public.is_ops() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid() or new.role is distinct from 'trekker' then
      raise exception 'users may only create their own trekker profile';
    end if;
  elsif new.role is distinct from old.role or new.id is distinct from old.id then
    raise exception 'only ops can change account authority';
  end if;
  return new;
end;
$$;

drop trigger if exists users_authority_guard on public.users;
create trigger users_authority_guard before insert or update on public.users
  for each row execute function public.guard_user_authority();

-- Cover guide INSERT as well as UPDATE. Direct self-applications start in the
-- unverified, unranked state; trusted fields remain service/ops-owned.
create or replace function public.guard_guide_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid()
       or new.status is distinct from 'applied'
       or new.tier is distinct from 0
       or new.treks_completed_platform is distinct from 0
       or new.journals_count is distinct from 0
       or new.response_rate is not null
       or new.median_response_mins is not null then
      raise exception 'guide application contains protected verification fields';
    end if;
  elsif new.status is distinct from old.status
     or new.tier is distinct from old.tier
     or new.slug is distinct from old.slug
     or new.licence_no is distinct from old.licence_no
     or new.treks_completed_platform is distinct from old.treks_completed_platform
     or new.journals_count is distinct from old.journals_count
     or new.response_rate is distinct from old.response_rate
     or new.median_response_mins is distinct from old.median_response_mins then
    raise exception 'guide may not modify verification/ranking columns';
  end if;
  return new;
end;
$$;

drop trigger if exists guides_guard on public.guides;
create trigger guides_guard before insert or update on public.guides
  for each row execute function public.guard_guide_columns();

-- A proposal recipient can answer the immutable offer, not rewrite it.
create or replace function public.guard_package_proposal_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    return new;
  end if;
  if row(new.id, new.enquiry_id, new.guide_id, new.trekker_id, new.start_date,
         new.days, new.party_size, new.price_breakdown, new.total_usd_cents,
         new.deposit_usd_cents, new.note, new.booking_id, new.created_at)
     is distinct from
     row(old.id, old.enquiry_id, old.guide_id, old.trekker_id, old.start_date,
         old.days, old.party_size, old.price_breakdown, old.total_usd_cents,
         old.deposit_usd_cents, old.note, old.booking_id, old.created_at) then
    raise exception 'proposal terms are immutable after submission';
  end if;
  if auth.uid() = old.trekker_id then
    if old.status is distinct from 'proposed' or new.status is distinct from 'declined' then
      raise exception 'trekker may only decline a proposed offer';
    end if;
  elsif auth.uid() = old.guide_id then
    if old.status is distinct from 'proposed' or new.status is distinct from 'withdrawn' then
      raise exception 'guide may only withdraw a proposed offer';
    end if;
  else
    raise exception 'not a proposal participant';
  end if;
  return new;
end;
$$;

drop trigger if exists package_proposals_update_guard on public.package_proposals;
create trigger package_proposals_update_guard before update on public.package_proposals
  for each row execute function public.guard_package_proposal_update();

-- Public callers use the deliberately narrow view, never the event base row.
drop policy if exists events_public_read on public.events;
revoke select on public.events from anon;
grant select on public.public_events to anon, authenticated;

-- Organisers own the pitch and accepted detail. Review/publication fields and
-- state transitions stay with ops/service authority.
create or replace function public.guard_event_authority()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.organiser_id is distinct from auth.uid()
       or new.status not in ('draft', 'submitted')
       or new.guide_id is not null or new.ops_note is not null
       or new.decline_reason is not null or new.reviewed_by is not null
       or new.reviewed_at is not null or new.published_at is not null then
      raise exception 'event contains ops-owned fields';
    end if;
  else
    if new.organiser_id is distinct from old.organiser_id
       or new.guide_id is distinct from old.guide_id
       or new.ops_note is distinct from old.ops_note
       or new.decline_reason is distinct from old.decline_reason
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.published_at is distinct from old.published_at then
      raise exception 'only ops may change event review fields';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('submitted','cancelled'))
      or (old.status = 'accepted' and new.status in ('review','cancelled'))
      or (old.status in ('submitted','review') and new.status = 'cancelled')
    ) then
      raise exception 'event transition requires ops review';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_authority_guard on public.events;
create trigger events_authority_guard before insert or update on public.events
  for each row execute function public.guard_event_authority();

-- Draft-only guide journals. Proof, consent, and publication remain reviewed.
create or replace function public.guard_journal_publish()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.guide_id is distinct from auth.uid()
       or new.status is distinct from 'draft'
       or new.pre_platform
       or new.client_names_ok
       or new.client_photos_ok then
      raise exception 'journal proof and publication require ops review';
    end if;
    if new.booking_id is null or not exists (
      select 1 from public.bookings b
      where b.id = new.booking_id and b.guide_id = auth.uid() and b.status = 'completed'
    ) then
      raise exception 'journal must reference the guide''s completed booking';
    end if;
  elsif old.status = 'published' then
    raise exception 'published journals are immutable outside ops review';
  elsif new.status is distinct from old.status
     or new.pre_platform is distinct from old.pre_platform
     or new.pre_platform_note is distinct from old.pre_platform_note
     or new.booking_id is distinct from old.booking_id
     or new.client_names_ok is distinct from old.client_names_ok
     or new.client_photos_ok is distinct from old.client_photos_ok then
    raise exception 'only ops can change journal proof, consent, or publication';
  end if;
  return new;
end;
$$;

drop trigger if exists journals_publish_guard on public.journals;
create trigger journals_publish_guard before insert or update on public.journals
  for each row execute function public.guard_journal_publish();

-- The child rows are the published journal body. Lock them at the same
-- boundary as their parent so direct PostgREST calls cannot rewrite live copy.
create or replace function public.guard_published_journal_entry()
returns trigger language plpgsql set search_path = public as $$
declare
  target_journal_id uuid;
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then
    target_journal_id := old.journal_id;
  else
    target_journal_id := new.journal_id;
  end if;
  if exists (
    select 1 from public.journals j
    where j.id = target_journal_id and j.status = 'published'
  ) then
    raise exception 'published journal entries are immutable outside ops review';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists journal_entries_publish_guard on public.journal_entries;
create trigger journal_entries_publish_guard
  before insert or update or delete on public.journal_entries
  for each row execute function public.guard_published_journal_entry();

-- Exactly one thread and membership in that thread are required on direct API
-- inserts. NOT VALID preserves any legacy rows while enforcing every new row.
alter table public.messages drop constraint if exists messages_thread_ck;
alter table public.messages drop constraint if exists messages_exactly_one_thread_ck;
alter table public.messages add constraint messages_exactly_one_thread_ck check (
  num_nonnulls(enquiry_id, booking_id, conversation_id) = 1
) not valid;

drop policy if exists messages_sender_create on public.messages;
create policy messages_sender_create on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and num_nonnulls(enquiry_id, booking_id, conversation_id) = 1
  and (
    (enquiry_id is not null and exists (
      select 1 from public.enquiries e where e.id = enquiry_id
        and (e.trekker_id = auth.uid() or e.guide_id = auth.uid())
    ))
    or (booking_id is not null and exists (
      select 1 from public.bookings b where b.id = booking_id
        and (b.trekker_id = auth.uid() or b.guide_id = auth.uid())
    ))
    or (conversation_id is not null and exists (
      select 1 from public.conversations c where c.id = conversation_id
        and (c.trekker_id = auth.uid() or c.guide_id = auth.uid())
    ))
  )
);

-- Message media is separate from intentionally public journal photography.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-photos', 'message-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';

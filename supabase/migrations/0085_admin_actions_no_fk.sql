-- 0085 — the audit log stops depending on the thing it audits.
--
-- 0084 pointed actor_id and target_user_id at users(id). There are no orphan
-- auth accounts today, so nothing was failing — but the day there is one, the
-- insert fails the foreign key and the action goes unrecorded. That day is
-- exactly the wrong day: an auth user with no profile row is a broken account,
-- and a broken account is what an admin is most likely to be reaching into.
--
-- An audit row has to be able to record something the rest of the schema
-- cannot explain. The ids stay as plain uuids, which is why the emails were
-- always stored alongside them.

alter table admin_actions drop constraint if exists admin_actions_actor_id_fkey;
alter table admin_actions drop constraint if exists admin_actions_target_user_id_fkey;

comment on column admin_actions.actor_id is
  'Plain uuid, deliberately not a foreign key: the log must record an action even against an account the rest of the schema cannot explain.';
comment on column admin_actions.target_user_id is
  'Plain uuid, deliberately not a foreign key. See actor_id.';

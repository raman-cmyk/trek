-- 0080 — The notifications nobody ever got.
--
-- 39 emails have been composed by this platform and 39 were logged `skipped`,
-- because RESEND_API_KEY has never been set. Every one of them is a thing
-- somebody was supposed to be told and was not: a guide accepted, a deposit
-- came in, a TIMS card was issued.
--
-- The email_log kept the recipient, the subject, and what each was about. That
-- is enough to hand people their own history the moment the bell exists,
-- rather than starting the record at today and pretending the last month was
-- quiet.
--
-- They arrive UNREAD on purpose. The claim "you were never told this" is true,
-- and the bell lighting up is the honest version of it.
--
-- Idempotent: nothing is inserted where a notification for the same person,
-- kind and minute already exists, so re-running adds nothing. On a fresh
-- clone email_log is empty and this does nothing at all.

insert into notifications (user_id, kind, title, body, href, about_type, about_id, created_at)
select
  coalesce(e.user_id, u.id)                                   as user_id,
  e.kind,
  left(e.subject, 200)                                        as title,
  null                                                        as body,
  case
    -- The trip page is the safe general answer: it shows a deposit still owed
    -- with the button to pay it, whatever the email originally pointed at.
    when e.subject_type = 'booking'          then '/trips/' || e.subject_id::text
    when e.subject_type = 'package_proposal' then '/proposals/' || e.subject_id::text
    else null
  end                                                         as href,
  e.subject_type,
  e.subject_id,
  e.created_at
from email_log e
left join users u on u.email = e.to_email
where coalesce(e.category, 'transactional') = 'transactional'
  and e.kind is not null
  and e.kind <> ''
  and e.kind not like '%\_ops'
  and e.kind not like 'ops\_%'
  and coalesce(e.user_id, u.id) is not null
  and not exists (
    select 1 from notifications n
    where n.user_id = coalesce(e.user_id, u.id)
      and n.kind = e.kind
      and date_trunc('minute', n.created_at) = date_trunc('minute', e.created_at)
  );

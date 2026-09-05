-- 0051 — A guide's status tells them the truth about where they are.
--
-- The guide dashboard draws a three-step bar: Applied → In review → Verified.
-- It reads guides.status, and nothing moved that off 'applied' except somebody
-- in the office remembering to press a button that, until recently, no screen
-- even had. So a guide could log in, see two of their checks passed and their
-- first-aid certificate cleared, and still be told they were merely "Applied".
--
-- Deciding a check *is* the review starting. Recording that is not the
-- office's job to remember — it is a consequence of the work they already did.
--
-- The one-time backfill for guides already part-way through is 0052, kept
-- separate because it rewrites existing rows and this does not.

create or replace function public.advance_guide_to_in_review()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Any outcome at all: passed, failed, expired or not needed. Only 'pending'
  -- means nobody has looked yet.
  if new.status <> 'pending' then
    update guides
      set status = 'in_review'
      where user_id = new.guide_id and status = 'applied';
  end if;
  return new;
end;
$$;

drop trigger if exists guide_verifications_advance on guide_verifications;
create trigger guide_verifications_advance
  after insert or update of status on guide_verifications
  for each row execute function public.advance_guide_to_in_review();

-- 0053 — A guide's photograph actually becomes their face.
--
-- Guides upload photos into guide_photos, and the first one is marked
-- 'headshot'. Every list on the site — the browse cards, the home rows, the
-- route pages, the group pages, the message header — reads users.avatar_url
-- instead. And nothing in the entire application has ever written
-- users.avatar_url. It is set once, by hand, in the seed file.
--
-- So a real guide uploaded their photograph, saw it appear on their own
-- profile page (which reads guide_photos directly), and remained a grey blank
-- circle everywhere a trekker would actually meet them. Their setup checklist
-- also read avatar_url, so "Add your photo" could never be ticked off by
-- anybody, ever.
--
-- Keeping the two in step is not something a form handler should have to
-- remember on four different code paths — add, make-main, delete, and ops
-- acting for a guide. It is a property of the data, so it lives here.

create or replace function public.sync_guide_avatar(p_guide uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
begin
  -- The headshot if there is one, otherwise their first photo, so a guide who
  -- deletes their portrait is left with a face rather than a blank.
  select gp.url into v_url
  from guide_photos gp
  where gp.guide_id = p_guide
  order by (gp.kind = 'headshot') desc, gp.sort, gp.created_at
  limit 1;

  update users set avatar_url = v_url where id = p_guide;
end;
$$;

create or replace function public.guide_photos_avatar_sync()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_guide_avatar(coalesce(new.guide_id, old.guide_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists guide_photos_avatar on guide_photos;
create trigger guide_photos_avatar
  after insert or update or delete on guide_photos
  for each row execute function public.guide_photos_avatar_sync();

-- Catch up the guides who already uploaded and were left faceless. Only where
-- avatar_url is null: the seeded demo guides have portraits set directly and
-- should keep them.
update users u
set avatar_url = p.url
from (
  select distinct on (gp.guide_id) gp.guide_id, gp.url
  from guide_photos gp
  order by gp.guide_id, (gp.kind = 'headshot') desc, gp.sort, gp.created_at
) p
where u.id = p.guide_id
  and u.avatar_url is null;

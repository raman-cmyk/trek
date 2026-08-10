-- 0016 — Fix public read of guide photos (M9 security pass).
--
-- Bug: the 0012 guide_photos_public_read policy tested verification with an
-- EXISTS over the `guides` base table. But `guides` has no anon SELECT policy
-- (payout/licence live there — public reads go through the public_guides view),
-- so for an anonymous visitor the subquery matched zero rows and the policy
-- always evaluated false. Result: the public guide-profile carousel
-- (guides.$slug.tsx, anon client) showed NO photos — on our primary SEO page.
--
-- Fix: check verification through a security-definer helper that bypasses RLS
-- on `guides`, mirroring public.is_ops(). Anon can now see a verified guide's
-- photos without gaining any access to the guides base table.

create or replace function public.is_verified_guide(uid uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guides
    where user_id = uid and status = 'verified'
  );
$$;

drop policy if exists guide_photos_public_read on guide_photos;

create policy guide_photos_public_read on guide_photos for select
  using (public.is_verified_guide(guide_id));

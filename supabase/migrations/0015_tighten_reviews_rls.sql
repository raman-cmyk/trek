-- 0015 — Tighten reviews RLS (M9 security pass).
--
-- The original reviews_public_read policy let ANY role (including anon) read
-- published trekker→guide rows straight off the base table. That exposed
-- columns the public_reviews view was built to hide: booking_id, author_id,
-- created_at — i.e. which booking produced a review and the author's user id.
--
-- Every public/anon code path already reads the security-definer public_reviews
-- view (home, offering detail, guide profile, ratings), which projects only the
-- safe columns and bypasses base-table RLS. So the base table no longer needs a
-- public branch: anon gets published reviews through the view, and the base
-- table is restricted to the author, the subject, and ops. Default-deny holds.

drop policy if exists reviews_public_read on reviews;

create policy reviews_self_read on reviews for select using (
  author_id = auth.uid()
  or subject_id = auth.uid()
  or public.is_ops()
);

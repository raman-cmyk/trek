-- 0070 — A row can be looked at before it goes live.
--
-- 0067 let anyone read a category only when `live` was true, which reads as
-- caution and behaves as a bug: the console's own "see the row" link showed an
-- empty page for every row still being built — exactly the moment somebody
-- wants to look at it. `live` decides whether a row appears on the homepage,
-- not whether the list behind it may be read, and there is nothing in a
-- category but a heading, an order, and a set of already-public guides.

drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories for select using (true);

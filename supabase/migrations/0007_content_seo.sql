-- 0007 — Content / SEO: redirects (301 table for renamed slugs, docs/02 §SEO).

create table redirects (
  from_path text primary key,
  to_path text not null
);
alter table redirects enable row level security;
-- Public read (the SSR layer resolves redirects on every request); ops write.
create policy redirects_public_read on redirects for select using (true);
create policy redirects_ops_write on redirects for all
  using (public.is_ops()) with check (public.is_ops());

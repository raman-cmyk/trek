-- 0046 — Guides may propose a route.
--
-- Guides run routes that are not among our twenty-four, and until now the only
-- way to list one was to ask the office to create it. `routes` was ops-write
-- only and had no notion of a route that is not yet public: every row was live
-- the moment it existed.
--
-- Two columns and four policies fix that. A guide writes a route as `pending`,
-- the office looks at it once, and only then does it appear in the picker for
-- everybody. The guide who proposed it is credited on the route page, because
-- somebody who has walked a route often enough to write it up is exactly the
-- person a reader wants to hear it from.

alter table routes
  add column if not exists status text not null default 'live'
    check (status in ('pending', 'live', 'rejected')),
  add column if not exists created_by_guide_id uuid references guides(user_id),
  add column if not exists review_note text;

-- Everything that existed before this migration was, by definition, ours and
-- already public.
update routes set status = 'live' where status is null;

create index if not exists routes_status_idx on routes (status);

-- ---- routes: reads ---------------------------------------------------------
-- The public read policy was `using (true)`, which would now expose a route
-- nobody has checked. A pending route is visible to the office and to the
-- guide who wrote it, and to nobody else.
drop policy if exists routes_public_read on routes;
create policy routes_public_read on routes for select using (
  status = 'live'
  or public.is_ops()
  or created_by_guide_id = auth.uid()
);

-- ---- routes: writes --------------------------------------------------------
-- A guide may propose one, and may keep editing it while it waits. They may
-- not publish it, may not alter anybody else's, and may not touch one the
-- office has already made live — the with-check clause is what enforces that,
-- since a bare `using` would let a guide flip their own route to live.
drop policy if exists routes_guide_propose on routes;
create policy routes_guide_propose on routes for insert with check (
  created_by_guide_id = auth.uid() and status = 'pending'
);

drop policy if exists routes_guide_edit_own_pending on routes;
create policy routes_guide_edit_own_pending on routes for update using (
  created_by_guide_id = auth.uid() and status = 'pending'
) with check (
  created_by_guide_id = auth.uid() and status = 'pending'
);

-- ---- permits on a proposed route ------------------------------------------
-- A route's permits are part of describing it, so the guide writes them with
-- the route. Only ever for a route that is theirs and still pending.
drop policy if exists permits_guide_write_own_pending on permits;
create policy permits_guide_write_own_pending on permits for all using (
  exists (
    select 1 from routes r
    where r.id = permits.route_id
      and r.created_by_guide_id = auth.uid()
      and r.status = 'pending'
  )
) with check (
  exists (
    select 1 from routes r
    where r.id = permits.route_id
      and r.created_by_guide_id = auth.uid()
      and r.status = 'pending'
  )
);

-- ---- an unreviewed route cannot carry a live trip --------------------------
-- The offering review and the route review are separate queues, and it would
-- otherwise be possible to approve a trek whose route nobody had looked at.
create or replace function public.guard_offering_route_live()
  returns trigger language plpgsql as $$
declare
  route_status text;
begin
  if new.status = 'live' and new.route_id is not null then
    select status into route_status from routes where id = new.route_id;
    if route_status is distinct from 'live' then
      raise exception 'route is not approved yet, so this trip cannot go live';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists offerings_route_live_guard on offerings;
create trigger offerings_route_live_guard before insert or update on offerings
  for each row execute function public.guard_offering_route_live();

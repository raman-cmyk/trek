-- 0013 — Documents: private Storage bucket + permit auto-creation on confirm.

-- Private bucket for passports/insurance (docs/CLAUDE.md rule #9). No public
-- policies on storage.objects → only the service role reaches it; all access is
-- via server-issued signed URLs (10-min TTL), logged to document_access_log.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- When a booking reaches 'confirmed', auto-create its permit applications from
-- the route's permits (ops tracks them via the M2 permit tracker).
create or replace function public.create_permit_apps_on_confirm()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    insert into permit_applications (booking_id, permit_id, status)
    select new.id, p.id, 'awaiting_docs'
    from offerings o
    join permits p on p.route_id = o.route_id
    where o.id = new.offering_id
      and not exists (
        select 1 from permit_applications pa
        where pa.booking_id = new.id and pa.permit_id = p.id
      );
  end if;
  return new;
end;
$$;

create trigger bookings_permit_apps after update on bookings
  for each row execute function public.create_permit_apps_on_confirm();

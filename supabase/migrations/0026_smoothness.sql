-- 0026 — Smoothness pass: security + money-correctness fixes (audit batch 1/2).

-- (1) Enquiries: the old participant UPDATE policy had no WITH CHECK, so a
-- trekker could self-accept their own enquiry from the browser client. Split
-- into role policies with explicit allowed transitions.
drop policy if exists enquiries_participant_update on enquiries;
create policy enquiries_trekker_update on enquiries for update
  using (trekker_id = auth.uid())
  with check (trekker_id = auth.uid() and status in ('open', 'expired'));
create policy enquiries_guide_update on enquiries for update
  using (guide_id = auth.uid())
  with check (guide_id = auth.uid() and status in ('quoted', 'accepted', 'declined'));

-- (2) Bookings: complete the money snapshot. quote() was dropping logistics
-- and Fund into no column, so the stored lines summed to less than total.
-- Also a hold TTL so accepted-but-unpaid bookings release the calendar.
alter table bookings add column logistics_usd_cents int not null default 0;
alter table bookings add column fund_usd_cents int not null default 0;
alter table bookings add column hold_expires_at timestamptz;

-- (3) Instalments: a cancelled booking's remaining instalments are cancelled,
-- never charged.
alter table instalments drop constraint instalments_status_check;
alter table instalments add constraint instalments_status_check
  check (status in ('scheduled', 'paid', 'cancelled'));

notify pgrst, 'reload schema';

-- 0003 — Transaction: enquiries, bookings, documents, permits, payments, payouts.

-- ---- enquiries -------------------------------------------------------------
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  trekker_id uuid not null references users(id),
  guide_id uuid not null references guides(user_id),
  offering_id uuid not null references offerings(id),
  start_date date not null,
  party_size int not null,
  message text,
  status text not null default 'open'
    check (status in ('open','quoted','accepted','declined','expired','converted')),
  expires_at timestamptz not null,     -- now() + 24h
  created_at timestamptz not null default now()
);
alter table enquiries enable row level security;
create policy enquiries_participant_read on enquiries for select
  using (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops());
create policy enquiries_trekker_create on enquiries for insert
  with check (trekker_id = auth.uid());
-- Trekker (edit/withdraw), guide (accept/decline/quote), ops all.
create policy enquiries_participant_update on enquiries for update
  using (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops());
create policy enquiries_ops_all on enquiries for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- bookings --------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid references enquiries(id),
  trekker_id uuid not null references users(id),
  guide_id uuid not null references guides(user_id),
  offering_id uuid not null references offerings(id),
  start_date date not null,
  end_date date not null,
  party_size int not null,
  status text not null default 'pending_deposit' check (status in
    ('pending_deposit','deposit_paid','docs_pending','confirmed',
     'active','completed','cancelled_trekker','cancelled_guide','cancelled_force_majeure')),
  -- money snapshot (immutable after deposit) — all integer cents/paisa.
  guide_fee_usd_cents int not null,
  porter_fee_usd_cents int not null default 0,
  permit_fees_usd_cents int not null default 0,
  service_fee_usd_cents int not null,
  permit_handling_usd_cents int not null default 0,
  total_usd_cents int not null,
  commission_usd_cents int not null,
  fx_rate_npr numeric not null,
  guide_payout_npr_paisa int not null,
  deposit_usd_cents int not null,
  deposit_paid_at timestamptz,
  balance_paid_at timestamptz,
  completed_confirmed_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bookings_touch before update on bookings
  for each row execute function public.touch_updated_at();

alter table bookings enable row level security;
create policy bookings_participant_read on bookings for select
  using (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops());
-- Bookings are created/advanced by server-side flows (service role) + ops.
create policy bookings_ops_all on bookings for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- booking_documents (passports/insurance — private) ---------------------
create table booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  person_name text not null,
  type text not null check (type in ('passport','insurance')),
  storage_path text not null,          -- private bucket
  verified_by uuid references users(id),
  verified_at timestamptz,
  delete_after date,                   -- completion + 90d
  created_at timestamptz not null default now()
);
alter table booking_documents enable row level security;
-- ops + the owning trekker only. Guides NEVER see documents (docs/02 §Security).
create policy booking_documents_access on booking_documents for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);
create policy booking_documents_trekker_upload on booking_documents for insert with check (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);
create policy booking_documents_ops_write on booking_documents for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- document_access_log ---------------------------------------------------
create table document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references booking_documents(id),
  accessed_by uuid not null references users(id),
  accessed_at timestamptz not null default now()
);
alter table document_access_log enable row level security;
create policy document_access_log_ops on document_access_log for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- permit_applications ---------------------------------------------------
create table permit_applications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  permit_id uuid not null references permits(id),
  status text not null default 'awaiting_docs'
    check (status in ('awaiting_docs','filed','approved','ready','rejected')),
  reference_no text,
  filed_at timestamptz,
  approved_at timestamptz,
  notes text
);
alter table permit_applications enable row level security;
-- ops manage; the owning trekker may read their booking's permit status.
create policy permit_applications_read on permit_applications for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);
create policy permit_applications_ops_write on permit_applications for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- payments --------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  stripe_payment_intent text,
  stripe_refund_id text,
  type text not null check (type in ('deposit','balance','full','refund')),
  amount_usd_cents int not null,       -- refunds negative
  status text not null check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now()
);
alter table payments enable row level security;
create policy payments_read on payments for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);
create policy payments_ops_write on payments for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- payouts ---------------------------------------------------------------
create table payouts (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  booking_id uuid not null references bookings(id),
  amount_npr_paisa int not null,
  method text not null,
  batch_ref text,
  receipt_url text,
  status text not null default 'payable' check (status in ('payable','paid')),
  paid_at timestamptz,
  paid_by uuid references users(id)
);
alter table payouts enable row level security;
create policy payouts_read on payouts for select
  using (guide_id = auth.uid() or public.is_ops());
create policy payouts_ops_write on payouts for all
  using (public.is_ops()) with check (public.is_ops());

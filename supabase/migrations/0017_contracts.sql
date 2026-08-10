-- 0017 — Company↔Guide contracts.
--
-- Ops manage reusable contract *templates*. When a guide accepts a booking, a
-- *contract* is generated from the active template (placeholders filled with
-- that booking's terms) and auto-signed by both sides — the guide's acceptance
-- is their signature; the Company counter-signs automatically.

create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,                    -- markdown-ish with {{placeholders}}
  version int not null default 1,
  active boolean not null default false, -- at most one active at a time
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table contract_templates enable row level security;
-- Ops-only surface (managed from /ops/contracts).
create policy contract_templates_ops_all on contract_templates for all
  using (public.is_ops()) with check (public.is_ops());
create trigger contract_templates_touch before update on contract_templates
  for each row execute function public.touch_updated_at();

create table contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references bookings(id) on delete cascade,
  guide_id uuid not null references users(id),
  template_id uuid references contract_templates(id),
  template_version int,
  title text not null,
  body_rendered text not null,           -- snapshot with placeholders resolved
  terms jsonb not null default '{}'::jsonb,
  company_signatory text,
  company_signed_at timestamptz,
  guide_signed_at timestamptz,
  status text not null default 'draft',  -- draft | signed
  created_at timestamptz not null default now()
);
alter table contracts enable row level security;
-- Ops see all; the guide can read their own signed agreement. No trekker access.
create policy contracts_ops_all on contracts for all
  using (public.is_ops()) with check (public.is_ops());
create policy contracts_guide_read on contracts for select
  using (guide_id = auth.uid());

create index contracts_guide_idx on contracts(guide_id);

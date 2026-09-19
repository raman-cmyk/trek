-- 0070 — Bind provider payment facts to one booking and settle atomically.

-- PostgREST upsert needs a real unique constraint; the old partial index could
-- not be inferred from either conflict target used by the application.
drop index if exists public.payments_intent_type_uniq;
alter table public.payments drop constraint if exists payments_intent_type_key;
alter table public.payments
  add constraint payments_intent_type_key unique (stripe_payment_intent, type);

-- A booking has one active deposit intent. Superseded intents are marked
-- failed before a replacement is inserted.
with ranked as (
  select id, row_number() over (partition by booking_id order by created_at desc, id desc) as rn
  from public.payments where type = 'deposit' and status = 'pending'
)
update public.payments p set status = 'failed'
from ranked r where p.id = r.id and r.rn > 1;

create unique index if not exists payments_one_pending_deposit_per_booking
  on public.payments (booking_id)
  where type = 'deposit' and status = 'pending';

-- Bind the selected balance plan before either the checkout action or a
-- Stripe webhook may fulfil the deposit. Otherwise the webhook can win the
-- race and silently settle an instalment booking with the default plan.
alter table public.payments add column if not exists instalment_count integer;
alter table public.payments add column if not exists plan_selected_at timestamptz;
alter table public.payments drop constraint if exists payments_instalment_count_check;
alter table public.payments add constraint payments_instalment_count_check
  check (instalment_count is null or instalment_count between 1 and 12);

-- Every live intent has a safe, fulfilable default before Stripe can confirm
-- it. The checkout may replace this with the customer's selected plan before
-- confirmation, but a webhook never has to wait for a browser POST.
update public.payments p set
  instalment_count = coalesce(p.instalment_count, b.instalment_count, 1),
  plan_selected_at = coalesce(p.plan_selected_at, now())
from public.bookings b
where p.booking_id = b.id and p.type = 'deposit' and p.status = 'pending';

create or replace function public.settle_booking_deposit(
  p_booking_id uuid,
  p_payment_intent text,
  p_status text,
  p_amount_received integer,
  p_currency text,
  p_metadata_booking_id text,
  p_instalment_count integer default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  pay public.payments%rowtype;
  existing public.payments%rowtype;
  balance integer;
  n integer;
  span_days integer;
  base_amount integer;
  is_trek boolean;
begin
  if current_user not in ('service_role','supabase_admin','postgres') then
    raise exception 'deposit settlement requires service authority';
  end if;
  if p_status is distinct from 'succeeded' then
    raise exception 'payment intent has not succeeded';
  end if;
  if lower(coalesce(p_currency, '')) <> 'usd' then
    raise exception 'payment currency does not match booking currency';
  end if;
  if p_metadata_booking_id is distinct from p_booking_id::text then
    raise exception 'payment intent belongs to a different booking';
  end if;

  select * into existing from public.payments
    where stripe_payment_intent = p_payment_intent and type = 'deposit'
      and status = 'succeeded'
    for update;
  if found then
    if existing.booking_id is distinct from p_booking_id then
      raise exception 'payment intent is already bound to another booking';
    end if;
    return false;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;
  if b.status <> 'pending_deposit' then return false; end if;

  select * into pay from public.payments
    where booking_id = p_booking_id
      and stripe_payment_intent = p_payment_intent
      and type = 'deposit'
    for update;
  if not found or pay.status <> 'pending' then
    raise exception 'payment intent is not the active pending deposit';
  end if;
  if pay.plan_selected_at is null or pay.instalment_count is null then
    raise exception 'payment plan has not been selected';
  end if;
  if p_instalment_count is not null
     and p_instalment_count is distinct from pay.instalment_count then
    raise exception 'payment plan does not match the selected plan';
  end if;
  if pay.amount_usd_cents is distinct from b.deposit_usd_cents
     or p_amount_received is distinct from b.deposit_usd_cents then
    raise exception 'payment amount does not match the current deposit';
  end if;

  n := pay.instalment_count;
  update public.payments set status = 'succeeded' where id = pay.id;
  update public.bookings set
    instalment_count = n,
    status = 'deposit_paid',
    deposit_paid_at = now()
  where id = b.id;

  balance := b.total_usd_cents - b.deposit_usd_cents;
  select (o.kind = 'trek') into is_trek from public.offerings o where o.id = b.offering_id;
  if balance <= 0 then
    update public.bookings set
      balance_paid_at = now(),
      status = case when is_trek then 'docs_pending' else 'confirmed' end
    where id = b.id;
  elsif n > 1 then
    span_days := greatest(0, (b.start_date - 7) - current_date);
    base_amount := floor(balance::numeric / n)::integer;
    insert into public.instalments (booking_id, seq, amount_usd_cents, due_date)
    select
      b.id,
      i,
      case when i = n then balance - base_amount * (n - 1) else base_amount end,
      current_date + round(span_days::numeric * (i - 1) / (n - 1))::integer
    from generate_series(1, n) i;
  end if;

  update public.availability set status = 'booked' where booking_id = b.id;
  if b.enquiry_id is not null then
    update public.enquiries set status = 'converted' where id = b.enquiry_id;
  end if;
  return true;
end;
$$;

revoke all on function public.settle_booking_deposit(uuid,text,text,integer,text,text,integer) from public, anon, authenticated;
grant execute on function public.settle_booking_deposit(uuid,text,text,integer,text,text,integer) to service_role;

notify pgrst, 'reload schema';

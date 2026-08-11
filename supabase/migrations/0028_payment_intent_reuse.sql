-- 0028 — Reuse a pending deposit PaymentIntent across checkout page loads
-- instead of minting a new one on every GET. A booking can have at most one
-- payment row per (intent, type) — note refunds share the charge's intent id,
-- hence the composite key.

delete from payments a using payments b
  where a.ctid < b.ctid
    and a.stripe_payment_intent = b.stripe_payment_intent
    and a.type = b.type;

create unique index if not exists payments_intent_type_uniq
  on payments(stripe_payment_intent, type)
  where stripe_payment_intent is not null;

notify pgrst, 'reload schema';

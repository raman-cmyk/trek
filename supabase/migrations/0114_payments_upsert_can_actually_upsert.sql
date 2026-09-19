-- 0114 — Make the payments upserts work. They never have.
--
-- 0028 added this index to let a pending deposit PaymentIntent be reused
-- across checkout page loads:
--
--   create unique index payments_intent_type_uniq
--     on payments(stripe_payment_intent, type)
--     where stripe_payment_intent is not null;
--
-- It is PARTIAL. Postgres will only infer a non-partial unique index for an
-- ON CONFLICT (cols) clause — to use a partial one the statement must repeat
-- its predicate — and PostgREST's `on_conflict=` takes column names only,
-- with nowhere to put a WHERE. So every upsert against this table has failed
-- with 42P10, "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification", since the day 0028 shipped. The feature 0028 was
-- written to enable has therefore never worked once.
--
-- Nobody noticed because both callers `await` the upsert without reading the
-- result, which is the exact thing CLAUDE.md warns about. The damage was
-- invisible while payments were mocked; it surfaced the first time real money
-- moved (19 Sep 2026): a $223.02 deposit succeeded at Stripe, the booking
-- advanced to deposit_paid, and the payments table stayed empty.
--
-- Dropping the predicate is behaviour-preserving. Unique indexes treat NULLs
-- as distinct by default, so rows with no intent id still do not collide with
-- each other — exactly what the WHERE clause was achieving.
--
-- NOT URGENT, and nothing is waiting on it. The code no longer upserts at
-- all: both callers insert and fall back to an update on 23505, which works
-- against the partial index exactly as it stands. That is the better shape
-- regardless — it does not depend on an index PostgREST cannot express — so
-- this migration is tidying, not a fix anything is blocked on. Apply it when
-- a Supabase access token is to hand.

drop index if exists payments_intent_type_uniq;

create unique index if not exists payments_intent_type_uniq
  on payments(stripe_payment_intent, type);

notify pgrst, 'reload schema';

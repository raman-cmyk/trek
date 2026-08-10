-- 0021 — Message-before-pay (Feature Pack v3 §2). A free conversation with a
-- named guide BEFORE any enquiry or money — the differentiator and the fraud
-- filter. Distinct from enquiry/booking threads (which come later in the spine).

create table conversations (
  id uuid primary key default gen_random_uuid(),
  trekker_id uuid not null references users(id),
  guide_id uuid not null references users(id),
  offering_id uuid references offerings(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
alter table conversations enable row level security;
create policy conversations_participant on conversations for select using (
  trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops()
);
create index conversations_trekker_idx on conversations(trekker_id);
create index conversations_guide_idx on conversations(guide_id);

-- Let a message belong to a conversation too. Drop the old
-- (enquiry_id or booking_id) check and replace it to include conversations.
alter table messages add column conversation_id uuid references conversations(id);
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c' limit 1;
  if c is not null then execute 'alter table public.messages drop constraint ' || quote_ident(c); end if;
end $$;
alter table messages add constraint messages_thread_ck
  check (conversation_id is not null or enquiry_id is not null or booking_id is not null);

-- Additive read policy for conversation participants (OR'd with the existing).
create policy messages_conversation_read on messages for select using (
  conversation_id is not null and exists (
    select 1 from conversations c where c.id = messages.conversation_id
      and (c.trekker_id = auth.uid() or c.guide_id = auth.uid())
  )
);

create index messages_conversation_idx on messages(conversation_id);

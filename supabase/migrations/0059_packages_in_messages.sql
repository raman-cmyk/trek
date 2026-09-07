-- 0059 — A package can be agreed in a conversation, not only in an enquiry.
--
-- Most trips do not begin with the booking form. They begin with "is Manaslu
-- doable in October?" in a message thread, and by the time the two of them
-- have agreed what the trip is, the conversation is the only place it exists.
-- Sending them back to a listing to press "Request to book", so that a guide
-- can then propose the thing they have already agreed, is a step nobody needs.
--
-- So a proposal can hang off a conversation as well as an enquiry, and a
-- message can carry one — or carry the trip it is asking about.

alter table package_proposals
  -- A proposal born in a conversation has no enquiry behind it.
  alter column enquiry_id drop not null;

alter table package_proposals
  add column if not exists conversation_id uuid references conversations(id) on delete cascade,
  -- Which trip it is a package of. Read from the enquiry until now; a
  -- conversation-born proposal has to carry it itself.
  add column if not exists offering_id uuid references offerings(id) on delete set null;

-- Every proposal belongs to one conversation or one enquiry. Neither would be
-- a proposal about nothing.
alter table package_proposals drop constraint if exists package_proposals_has_a_home;
alter table package_proposals add constraint package_proposals_has_a_home
  check (enquiry_id is not null or conversation_id is not null);

create index if not exists package_proposals_conversation_idx
  on package_proposals (conversation_id, created_at desc);

-- Existing rows: the offering is the one their enquiry named.
update package_proposals p
   set offering_id = e.offering_id
  from enquiries e
 where p.enquiry_id = e.id and p.offering_id is null;

-- ---------------------------------------------------------------------------
-- Messages that carry something
-- ---------------------------------------------------------------------------
-- Both nullable and both plain references: a message is still a message, and
-- a thread that cannot render the attachment still shows what was said.

alter table messages
  -- "This is the trip I mean" — chosen by the trekker as they write.
  add column if not exists offering_id uuid references offerings(id) on delete set null,
  -- The package the guide sent, shown in the thread as a card you can accept.
  add column if not exists proposal_id uuid references package_proposals(id) on delete set null;

create index if not exists messages_proposal_idx
  on messages (proposal_id) where proposal_id is not null;

notify pgrst, 'reload schema';

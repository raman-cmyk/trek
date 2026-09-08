-- 0069 — Everyone pays their own share, for real this time.
--
-- "Everyone pays individually" has been the model since groups were designed,
-- and the database has believed it since 0039: every member carries a share
-- and an amount paid, `payments` carries the member who paid, and there is a
-- 'share' payment type. Not one line of code ever wrote any of it. Checkout
-- was scoped to the booking's own trekker, so only the organiser could pay,
-- and everyone else was told to "settle up with the organiser" — which is
-- precisely the errand this product exists to delete.
--
-- The tables were right. What was missing was the one policy that lets a
-- member see the payment they just made: `payments` was readable by the
-- booking's trekker and by ops, so a member paying their own share could not
-- read it back.

drop policy if exists payments_read on payments;
create policy payments_read on payments for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
  or exists (
    select 1 from trip_group_members m
    where m.id = payments.group_member_id and m.user_id = auth.uid()
  )
);

-- A minor has no approved result yet while the parent signs, so the row must not depend on one.
-- Column grants already hide token_hash; the row stays visible only to its own user.
drop policy parent_consents_own on public.parent_consents;
create policy parent_consents_own on public.parent_consents for select to authenticated
  using (user_id = auth.uid());

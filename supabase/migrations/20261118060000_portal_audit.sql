-- Portal audit fixes (portal-v1-audit). Additive: replaces two functions, no data touched.
--
-- 1. Ownership reads the address from auth.users, not from the JWT. The token keeps the address it was issued with
--    for up to an hour after an email change, and an auth hook could rewrite claims; auth.users is the source of
--    truth and is the row whose email_confirmed_at we already check.
-- 2. portal_peer_down picked "my" result with SELECT INTO over every approved result of the mailbox, which takes an
--    arbitrary row when someone applied twice and both applications have an approved result. Tapping a peer of the
--    other result then failed with "not your match". It now finds the match first and takes my side of it.

create or replace function public.portal_my_application_ids() returns setof bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id
  from auth.users u
  join public.applications a on a.email_key = public.email_key(u.email)
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and u.email is not null
    and public.portal_owns_email(a.email, u.email)
$$;

create or replace function public.portal_peer_down(p_match bigint) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare mine bigint; m record;
begin
  select pm.*, (case when ra.id is not null then pm.result_a else pm.result_b end) as my_side into m
  from public.peer_matches pm
  left join public.results ra on ra.id = pm.result_a and ra.status = 'approved' and ra.season = 'fall-2026'
    and ra.application_id in (select public.portal_my_application_ids())
  left join public.results rb on rb.id = pm.result_b and rb.status = 'approved' and rb.season = 'fall-2026'
    and rb.application_id in (select public.portal_my_application_ids())
  where pm.id = p_match and (ra.id is not null or rb.id is not null)
  for update of pm;
  if m.id is null then raise exception 'not your match' using errcode = '42501'; end if;
  mine := m.my_side;
  if m.result_a = mine then
    update public.peer_matches set a_down_at = coalesce(a_down_at, now()) where id = m.id returning * into m;
  else
    update public.peer_matches set b_down_at = coalesce(b_down_at, now()) where id = m.id returning * into m;
  end if;
  return m.a_down_at is not null and m.b_down_at is not null;
end $$;

-- create or replace keeps existing grants; restate them so this file is correct on its own.
revoke execute on function public.portal_my_application_ids(), public.portal_peer_down(bigint) from public, anon;
grant execute on function public.portal_my_application_ids(), public.portal_peer_down(bigint) to authenticated, service_role;

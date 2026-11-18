-- Portal audit check for 20261118060000_portal_audit.sql. LOCAL db only; all rolls back. Every assertion raises.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  uf uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); uh uuid := gen_random_uuid(); uk uuid := gen_random_uuid();
  uo uuid := gen_random_uuid(); uu uuid := gen_random_uuid();
  f1 bigint; f2 bigint; ag bigint; ah bigint; ak bigint;
  rf1 bigint; rf2 bigint; rg bigint; rh bigint; rk bigint; m1 bigint; m2 bigint; m_gh bigint;
  me jsonb; ok boolean; n int;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (uf, 'fay@example.com', now()), (ug, 'gus@example.com', now()), (uh, 'hal@example.com', now()),
    (uk, 'kit@example.com', now()),
    -- changed their address: auth.users holds the new one, an old token still carries the old one
    (uo, 'new-owner@example.com', now()),
    -- unconfirmed sign up with someone else's address
    (uu, 'kit@example.com', null);

  -- Fay applied twice and both applications got an approved result, each with its own peer.
  insert into public.applications (role, name, email, org, working_on, source, created_at)
    values ('student', 'Fay One', 'fay@example.com', 'A', 'x', '/apply', now() - interval '3 days') returning id into f1;
  insert into public.applications (role, name, email, org, working_on, source)
    values ('student', 'Fay Two', 'fay@example.com', 'B', 'x', '/apply') returning id into f2;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Gus', 'gus@example.com', 'x', '/apply') returning id into ag;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Hal', 'hal@example.com', 'x', '/apply') returning id into ah;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Kit', 'kit@example.com', 'x', '/apply') returning id into ak;

  insert into public.results (application_id, outcome, status) values (f1, 'peer', 'approved') returning id into rf1;
  insert into public.results (application_id, outcome, status) values (f2, 'peer', 'approved') returning id into rf2;
  insert into public.results (application_id, outcome, status) values (ag, 'peer', 'approved') returning id into rg;
  insert into public.results (application_id, outcome, status) values (ah, 'peer', 'approved') returning id into rh;
  insert into public.results (application_id, outcome, status) values (ak, 'peer', 'approved') returning id into rk;
  insert into public.peer_matches (result_a, result_b) values (rf1, rg) returning id into m1;
  insert into public.peer_matches (result_a, result_b) values (rh, rf2) returning id into m2;
  insert into public.peer_matches (result_a, result_b) values (rg, rh) returning id into m_gh;

  set local role authenticated;

  -- Fay can tap on the peers of both her results, on the right side of each pair.
  perform pg_temp.as_user(uf, 'fay@example.com');
  begin perform public.portal_peer_down(m1); ok := true; exception when insufficient_privilege then ok := false; end;
  if not ok then raise exception 'applied twice: tap on first result''s peer refused'; end if;
  begin perform public.portal_peer_down(m2); ok := true; exception when insufficient_privilege then ok := false; end;
  if not ok then raise exception 'applied twice: tap on second result''s peer refused'; end if;
  -- still cannot tap on someone else's pair
  begin perform public.portal_peer_down(m_gh); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'Fay tapped on Gus and Hal''s pair'; end if;
  begin perform public.portal_peer_down(-1); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'unknown match did not raise'; end if;
  reset role;
  if (select a_down_at is null or b_down_at is not null from public.peer_matches where id = m1) then
    raise exception 'tap on m1 set the wrong side'; end if;
  if (select b_down_at is null or a_down_at is not null from public.peer_matches where id = m2) then
    raise exception 'tap on m2 set the wrong side'; end if;

  set local role authenticated;
  -- A token whose email claim is not the account's confirmed address owns nothing under the claimed address.
  perform pg_temp.as_user(uo, 'kit@example.com');
  me := public.portal_me();
  if (me->>'application')::boolean then raise exception 'stale or forged email claim reached Kit''s application: %', me; end if;
  select count(*) into n from public.results;
  if n <> 0 then raise exception 'stale email claim sees % results rows', n; end if;

  -- Unconfirmed account with Kit's address, even with a matching claim: nothing.
  perform pg_temp.as_user(uu, 'kit@example.com');
  me := public.portal_me();
  if (me->>'application')::boolean then raise exception 'unconfirmed account reached Kit''s application'; end if;
  begin perform public.portal_peer_down(m_gh); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'unconfirmed account tapped down'; end if;

  -- Kit with a correct token still works.
  perform pg_temp.as_user(uk, 'kit@example.com');
  me := public.portal_me();
  if me->'result'->>'outcome' is distinct from 'peer' then raise exception 'Kit lost their result: %', me; end if;

  -- No session at all (authenticated role, empty claims): nothing.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  me := public.portal_me();
  if (me->>'application')::boolean then raise exception 'no-sub token owns an application'; end if;
  reset role;

  -- anon still cannot run the replaced functions
  set local role anon;
  begin perform public.portal_my_application_ids(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_my_application_ids'; end if;
  begin perform public.portal_peer_down(m1); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_peer_down'; end if;
  reset role;
end $$;

rollback;

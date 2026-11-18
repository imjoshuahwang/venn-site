-- Portal v1 check for 20261118045934_portal_v1.sql. LOCAL db only; all rolls back. Every assertion raises.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); up uuid := gen_random_uuid();
  aa bigint; ab bigint; ac bigint; ad bigint; ra bigint; rb bigint; rc bigint; rd bigint;
  coh bigint; small bigint; m_ab bigint; m_ac bigint; m_bd bigint; me jsonb; n int; ok boolean; bothdown boolean;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'ana@example.com', now()), (ub, 'ben@example.com', now()), (uc, 'cara@example.com', now()),
    (up, 'ana+evil@example.com', now());
  insert into public.applications (role, name, email, org, building, working_on, source)
    values ('student', 'Ana Li', 'ana@example.com', 'Code Club', 'a tutoring app', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, org, building, working_on, source)
    values ('student', 'Ben Ortiz', 'ben@example.com', 'Robotics', 'a rover', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, org, working_on, source)
    values ('student', 'Cara Kim', 'cara@example.com', 'Debate', 'x', '/apply') returning id into ac;
  insert into public.applications (role, name, email, working_on, source)
    values ('student', 'Dev Rao', 'dev@example.com', 'x', '/apply') returning id into ad;

  insert into public.cohorts (slug, name, company, goal, prompts) values ('quadron', 'Quadron', 'Quadron', 'g', 'p1')
    returning id into coh;
  insert into public.cohorts (slug, name, seat_cap) values ('tiny', 'Tiny', 1) returning id into small;

  insert into public.results (application_id, outcome, cohort_id, why_matched, status)
    values (aa, 'cohort', coh, 'w', 'approved') returning id into ra;
  insert into public.results (application_id, outcome, why_matched, status)
    values (ab, 'peer', 'w', 'approved') returning id into rb;
  insert into public.results (application_id, outcome, why_matched, outlet)
    values (ac, 'not_this_season', 'w', 'Imperial Review') returning id into rc;  -- draft
  insert into public.results (application_id, outcome, cohort_id, status)
    values (ad, 'cohort', small, 'approved') returning id into rd;

  -- seat cap
  begin update public.results set cohort_id = small where id = rb; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'seat cap 1 let a second result in'; end if;
  update public.results set why_matched = 'w2' where id = rd;  -- unrelated update of a seated row still works
  begin update public.cohorts set seat_cap = 0 where id = small; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'seat_cap 0 accepted'; end if;

  -- A is a track member AND has two peers (max 3 entities)
  insert into public.peer_matches (result_a, result_b, why_matched) values (ra, rb, 'both build tools') returning id into m_ab;
  insert into public.peer_matches (result_a, result_b, why_matched) values (rc, ra, 'x') returning id into m_ac;
  insert into public.peer_matches (result_a, result_b, why_matched) values (rb, rd, 'x') returning id into m_bd;

  -- anon cannot call portal RPCs
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.portal_me(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_me'; end if;
  begin perform public.portal_peer_down(m_ab); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_peer_down'; end if;
  reset role;

  set local role authenticated;

  -- plus address on a non-Gmail domain is a different mailbox: owns nothing
  perform pg_temp.as_user(up, 'ana+evil@example.com');
  me := public.portal_me();
  if (me->>'application')::boolean then raise exception 'plus address claimed Ana''s application'; end if;

  -- A: track + one visible peer (C's result is a draft, so C stays hidden)
  perform pg_temp.as_user(ua, 'ana@example.com');
  me := public.portal_me();
  if me->'result'->>'outcome' <> 'cohort' then raise exception 'A outcome wrong: %', me; end if;
  if me->'result'->'track'->>'name' <> 'Quadron' then raise exception 'A track missing'; end if;
  if me->'result'->'track'->>'prompts' <> 'p1' then raise exception 'A prompts missing'; end if;
  if jsonb_array_length(me->'result'->'peers') <> 1 then raise exception 'A should see 1 approved peer: %', me->'result'->'peers'; end if;
  if me->'result'->'peers'->0->>'name' <> 'Ben Ortiz' then raise exception 'A peer wrong'; end if;
  if me->'result'->'peers'->0 ? 'email' and me->'result'->'peers'->0->>'email' is not null then
    raise exception 'peer email shown before both tapped'; end if;
  if (me->'result'->>'viewed')::boolean then raise exception 'viewed before mark'; end if;
  perform public.portal_mark_viewed();
  if not (public.portal_me()->'result'->>'viewed')::boolean then raise exception 'mark_viewed did nothing'; end if;

  -- A taps down on A-B: not both yet
  bothdown := public.portal_peer_down(m_ab);
  if bothdown then raise exception 'both_down after one tap'; end if;
  -- A cannot tap on B-D
  begin perform public.portal_peer_down(m_bd); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'A tapped on a match that is not theirs'; end if;

  -- B taps: both down, emails revealed to each other only
  perform pg_temp.as_user(ub, 'ben@example.com');
  bothdown := public.portal_peer_down(m_ab);
  if not bothdown then raise exception 'both_down false after both tapped'; end if;
  me := public.portal_me();
  select count(*) into n from jsonb_array_elements(me->'result'->'peers') e
    where e->>'email' = 'ana@example.com' and (e->>'both_down')::boolean;
  if n <> 1 then raise exception 'B cannot see Ana''s email after mutual tap: %', me; end if;
  select count(*) into n from jsonb_array_elements(me->'result'->'peers') e where e->>'email' is not null;
  if n <> 1 then raise exception 'B sees % emails, expected 1', n; end if;
  -- tapping again is a no-op
  if not public.portal_peer_down(m_ab) then raise exception 'second tap changed state'; end if;

  -- C: draft result means no result yet
  perform pg_temp.as_user(uc, 'cara@example.com');
  me := public.portal_me();
  if not (me->>'application')::boolean or me->'result' <> 'null'::jsonb then raise exception 'C sees a draft: %', me; end if;
  begin perform public.portal_peer_down(m_ac); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'draft owner tapped down'; end if;

  -- direct writes still blocked
  begin update public.peer_matches set a_down_at = now() where id = m_bd; get diagnostics n = row_count; ok := (n = 0);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated wrote peer_matches directly'; end if;
  reset role;

  -- applied twice: the older application has the approved result, the newer one has none
  declare ue uuid := gen_random_uuid(); e1 bigint; e2 bigint;
  begin
    insert into auth.users (id, email, email_confirmed_at) values (ue, 'eve@example.com', now());
    insert into public.applications (role, name, email, org, working_on, source, created_at)
      values ('student', 'Eve Park', 'eve@example.com', 'Lab', 'x', '/apply', now() - interval '2 days') returning id into e1;
    insert into public.applications (role, name, email, org, working_on, source)
      values ('student', 'Eve Park', 'eve@example.com', 'Lab again', 'x', '/apply') returning id into e2;
    insert into public.results (application_id, outcome, cohort_id, status) values (e1, 'cohort', coh, 'approved');
    set local role authenticated;
    perform pg_temp.as_user(ue, 'eve@example.com');
    me := public.portal_me();
    if me->'result'->>'outcome' is distinct from 'cohort' then raise exception 'duplicate applicant lost their result: %', me; end if;
    reset role;
  end;

  -- C approved: outlet comes through
  update public.results set status = 'approved' where id = rc;
  set local role authenticated;
  perform pg_temp.as_user(uc, 'cara@example.com');
  me := public.portal_me();
  if me->'result'->>'outlet' <> 'Imperial Review' then raise exception 'outlet missing: %', me; end if;
  reset role;
end $$;

rollback;

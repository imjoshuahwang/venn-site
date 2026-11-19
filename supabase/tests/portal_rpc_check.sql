-- Portal RPC check for 20261119030000_portal_rpc.sql (venn-site #116). LOCAL db only; all rolls back.
-- The fixture inserts approved results directly (test only); the RPCs never write status.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); um uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  aa bigint; ab bigint; ac bigint; ad bigint; ra bigint; rb bigint; rc bigint; rd bigint; coh bigint; mid bigint;
  p record; sig public.mou_signatures; ok boolean; n int; ts timestamptz; ts2 timestamptz;
  fns text[] := array['public.mark_viewed(bigint)', 'public.finish_ceremony(bigint)', 'public.get_my_peer(text)',
                      'public.peer_down(bigint)', 'public.sign_mou(bigint,text,boolean)'];
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'maya@example.com', now()), (ub, 'bo@example.com', now()), (uc, 'cy@example.com', now()), (um, 'tm@example.com', now());
  insert into public.applications (role, name, email, org, working_on, source)
    values ('student', 'Maya Lee', 'maya@example.com', 'Alpha HS', 'Solar kiosks' || E'\n' || 'second line', '/apply') returning id into aa;
  insert into public.applications (role, name, email, org, working_on, source)
    values ('student', 'Bo Chan', 'bo@example.com', 'Beta HS', 'Tutoring app', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Cy Park', 'cy@example.com', 'x', '/apply') returning id into ac;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Di Roe', 'di@example.com', 'x', '/apply') returning id into ad;
  insert into public.cohorts (slug, name, seat_cap) values ('q', 'Quadron', 2) returning id into coh;
  insert into public.results (application_id, outcome, cohort_id, status) values (aa, 'cohort', coh, 'approved') returning id into ra;
  insert into public.results (application_id, outcome, status) values (ab, 'peer', 'approved') returning id into rb;
  insert into public.results (application_id, outcome, cohort_id, status) values (ac, 'cohort', coh, 'approved') returning id into rc;
  insert into public.results (application_id, outcome, cohort_id) values (ad, 'cohort', coh) returning id into rd; -- draft
  insert into public.team_members (lead_result_id, email_key, user_id) values (ra, 'tm@example.com', um);
  insert into public.peer_matches (result_a, result_b, why_matched) values (ra, rb, 'both build for schools') returning id into mid;

  -- grants: anon/public cannot execute, authenticated can
  select count(*) into n from unnest(fns) f where has_function_privilege('anon', f, 'execute') or has_function_privilege('public', f, 'execute');
  if n <> 0 then raise exception 'anon/public can execute an RPC (%)', n; end if;
  select count(*) into n from unnest(fns) f where not has_function_privilege('authenticated', f, 'execute');
  if n <> 0 then raise exception 'authenticated cannot execute an RPC (%)', n; end if;

  -- stranger (Cy owns rc only): no peer card, cannot touch Maya's ids
  perform pg_temp.as_user(uc, 'cy@example.com'); set local role authenticated;
  select count(*) into n from public.get_my_peer(); if n <> 0 then raise exception 'get_my_peer returned a row without a match'; end if;
  begin perform public.peer_down(mid); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'peer_down by a stranger succeeded'; end if;
  begin perform public.mark_viewed(ra); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'mark_viewed by a stranger succeeded'; end if;
  begin perform public.sign_mou(ra, 'Cy Park', true); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'sign_mou by a stranger succeeded'; end if;
  begin perform public.finish_ceremony(ra); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'finish_ceremony by a stranger succeeded'; end if;
  reset role;

  -- mark_viewed keeps the first view
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  ts := public.mark_viewed(ra); if ts is null then raise exception 'mark_viewed returned null'; end if;
  reset role;
  update public.results set viewed_at = ts - interval '1 hour' where id = ra;
  set local role authenticated;
  ts2 := public.mark_viewed(ra); if ts2 <> ts - interval '1 hour' then raise exception 'mark_viewed overwrote the first view'; end if;
  reset role;

  -- team member: reads and views the lead's result, cannot tap
  perform pg_temp.as_user(um, 'tm@example.com'); set local role authenticated;
  perform public.mark_viewed(ra);
  select * into p from public.get_my_peer(); if p.match_id is distinct from mid then raise exception 'team member cannot read the lead peer card'; end if;
  begin perform public.peer_down(mid); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'team member tapped peer_down'; end if;
  reset role;

  -- pre-tap card: first name only, no email
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  select * into p from public.get_my_peer();
  if p.partner_name <> 'Bo' or p.partner_org <> 'Beta HS' or p.partner_email is not null or p.i_am_down or p.they_are_down then
    raise exception 'pre-tap card wrong: %', p; end if;
  -- #144: partner state/country come back (null until set), org still there as the fallback
  if p.partner_state is not null or p.partner_country is not null then raise exception 'location should start null: %', p; end if;
  reset role;
  update public.applications set state = 'Ohio', country = 'US' where id = ab;
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  select * into p from public.get_my_peer();
  if p.partner_state <> 'Ohio' or p.partner_country <> 'US' or p.partner_org <> 'Beta HS' then raise exception 'location wrong: %', p; end if;
  -- one tap: still no email; second tap is idempotent
  select * into p from public.peer_down(mid);
  if not p.i_am_down or p.they_are_down or p.partner_email is not null or p.partner_name <> 'Bo' then raise exception 'after one tap wrong: %', p; end if;
  perform public.peer_down(mid);
  reset role;
  if (select b_down_at from public.peer_matches where id = mid) is not null then raise exception 'wrong side tapped'; end if;

  -- Bo sees Maya already down, taps, and both contacts appear
  perform pg_temp.as_user(ub, 'bo@example.com'); set local role authenticated;
  select * into p from public.get_my_peer();
  if p.partner_email is not null or not p.they_are_down or p.i_am_down then raise exception 'Bo card before tap wrong: %', p; end if;
  select * into p from public.peer_down(mid);
  if p.partner_email is distinct from 'maya@example.com' or p.partner_name <> 'Maya Lee' or not (p.i_am_down and p.they_are_down) then
    raise exception 'after both tapped wrong: %', p; end if;
  if p.partner_project <> 'Solar kiosks' then raise exception 'one-line project wrong: %', p.partner_project; end if;
  reset role;

  -- a draft partner stays hidden: zero rows, tap refused
  update public.results set status = 'draft' where id = rb;
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  select count(*) into n from public.get_my_peer(); if n <> 0 then raise exception 'draft partner revealed'; end if;
  begin perform public.peer_down(mid); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'peer_down with a draft partner succeeded'; end if;
  reset role;
  update public.results set status = 'approved' where id = rb;

  -- sign_mou validation, then success with server-filled user_id and cohort_id
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  begin perform public.sign_mou(ra, '   ', true); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'blank typed name accepted'; end if;
  begin perform public.sign_mou(ra, 'Maya Lee', false); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'agreed=false accepted'; end if;
  begin perform public.sign_mou(ra, 'Maya Lee', null); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'agreed=null accepted'; end if;
  sig := public.sign_mou(ra, '  Maya Lee  ', true);
  if sig.typed_name <> 'Maya Lee' or sig.user_id <> ua or sig.cohort_id <> coh or sig.result_id <> ra then raise exception 'signature row wrong: %', sig; end if;
  begin perform public.sign_mou(ra, 'Maya Lee', true); ok := false; exception when unique_violation then ok := true; end;
  if not ok then raise exception 'double sign accepted'; end if;
  perform public.finish_ceremony(ra);
  reset role;
  select count(*) into n from public.results where id = ra and ceremony_done_at is not null;
  if n <> 1 then raise exception 'ceremony not set'; end if;

  -- seat cap 2: Maya plus one team member fill it, so Cy is refused
  perform pg_temp.as_user(uc, 'cy@example.com'); set local role authenticated;
  begin perform public.sign_mou(rc, 'Cy Park', true); ok := false; exception when others then ok := sqlstate = '53400'; end;
  if not ok then raise exception 'seat cap not enforced'; end if;
  reset role;

  -- non-cohort and draft results cannot sign
  perform pg_temp.as_user(ub, 'bo@example.com'); set local role authenticated;
  begin perform public.sign_mou(rb, 'Bo Chan', true); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'peer result signed an MOU'; end if;
  reset role;
  insert into auth.users (id, email, email_confirmed_at) values (ud, 'di@example.com', now());
  perform pg_temp.as_user(ud, 'di@example.com'); set local role authenticated;
  begin perform public.sign_mou(rd, 'Di Roe', true); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'draft result signed an MOU'; end if;
  reset role;

  -- anon fails at runtime too
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.mark_viewed(ra); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon executed mark_viewed'; end if;
  reset role;
end $$;

rollback;

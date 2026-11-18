-- Portal schema check for 20261118000000_portal.sql (venn-site #113). LOCAL db only; all rolls back.
-- Every assertion raises on failure.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ut uuid := gen_random_uuid();
  aa bigint; ab bigint; at_ bigint; ac bigint; ad bigint;
  ra bigint; rb bigint; rt bigint; rc bigint; rd bigint; coh bigint; n int; ok boolean;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'Maya.Test+x@Gmail.com', now()), (ub, 'bo@example.com', now()), (uc, 'cy@example.com', null),
    (ut, 'tess@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Maya', 'mayatest@gmail.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Bo', 'bo@example.com', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Tess', 'tess@example.com', 'x', 'test') returning id into at_;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Cy', 'cy@example.com', 'x', '/apply') returning id into ac;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Di', 'di@example.com', 'x', '/apply') returning id into ad;
  if not (select is_test from public.applications where id = at_) then raise exception 'fixture: Test row not is_test'; end if;

  insert into public.cohorts (slug, name, company, goal, criteria, timeline, season) values ('q', 'Quadron', 'Quadron', 'g', 'c', 't', 'fall-2026') returning id into coh;
  insert into public.results (application_id, outcome, cohort_id, why_matched) values (aa, 'cohort', coh, 'w') returning id into ra;
  insert into public.results (application_id, outcome, why_matched) values (ab, 'peer', 'w') returning id into rb;
  insert into public.results (application_id, outcome, why_matched) values (at_, 'cohort', 'w') returning id into rt;
  insert into public.results (application_id, outcome, why_matched, status) values (ac, 'peer', 'w', 'approved') returning id into rc;
  insert into public.results (application_id, outcome, why_matched, status) values (ad, 'peer', 'w', 'approved') returning id into rd;
  insert into public.peer_matches (season, result_a, result_b, why_matched) values ('fall-2026', ra, rb, 'w');
  insert into public.mou_signatures (result_id, cohort_id, typed_name, agreed, user_id) values (ra, coh, 'Maya', true, ua);

  -- constraints
  begin insert into public.results (application_id, outcome, why_matched) values (aa, 'peer', 'w'); ok := false;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'duplicate (application_id, season) accepted'; end if;
  begin insert into public.results (application_id, outcome, season) values (aa, 'peer', 'spring-2027'); ok := true;
  exception when others then ok := false; end;
  if not ok then raise exception 'same application in another season rejected'; end if;
  begin insert into public.results (application_id, outcome, season) values (ad, 'bogus', 'x'); ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'outcome outside the 5 values accepted'; end if;
  begin insert into public.peer_matches (season, result_a, result_b) values ('fall-2026', rc, rc); ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'peer pair a=b accepted'; end if;
  -- Peers (portal v1): up to 2 pairs per result, never the same pair twice. Checked in a savepoint that rolls back.
  begin
    insert into public.peer_matches (season, result_a, result_b) values ('fall-2026', ra, rc);  -- A's 2nd pair: ok
    begin insert into public.peer_matches (season, result_a, result_b) values ('fall-2026', rd, ra); ok := false;
    exception when unique_violation then ok := true; end;
    if not ok then raise exception 'third pair for one result accepted (b side)'; end if;
    begin insert into public.peer_matches (season, result_a, result_b) values ('fall-2026', ra, rd); ok := false;
    exception when unique_violation then ok := true; end;
    if not ok then raise exception 'third pair for one result accepted (a side)'; end if;
    begin insert into public.peer_matches (season, result_a, result_b) values ('fall-2026', rb, ra); ok := false;
    exception when unique_violation then ok := true; end;
    if not ok then raise exception 'same pair accepted twice (reversed)'; end if;
    raise exception 'rollback_pairs';
  exception when raise_exception then
    if sqlerrm <> 'rollback_pairs' then raise; end if;
  end;
  begin insert into public.mou_signatures (result_id, cohort_id, typed_name, agreed, user_id) values (ra, coh, 'Maya', true, ua); ok := false;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'second MOU for one result accepted'; end if;

  -- anon: nothing
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform 1 from public.results; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select results'; end if;
  begin perform 1 from public.cohorts; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select cohorts'; end if;
  begin perform 1 from public.peer_matches; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select peer_matches'; end if;
  begin perform 1 from public.mou_signatures; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select mou_signatures'; end if;
  begin perform public.portal_my_application_ids(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_my_application_ids'; end if;
  reset role;

  -- user A (gmail dot/plus variant, confirmed): helper works, draft invisible
  set local role authenticated;
  perform pg_temp.as_user(ua, 'Maya.Test+x@Gmail.com');
  select count(*) into n from public.portal_my_application_ids() i where i = aa;
  if n <> 1 then raise exception 'helper: gmail dot/plus variant not matched'; end if;
  select count(*) into n from public.portal_my_application_ids();
  if n <> 1 then raise exception 'helper returned % ids for A', n; end if;
  select count(*) into n from public.results;
  if n <> 0 then raise exception 'A sees draft result (%)', n; end if;
  select count(*) into n from public.cohorts;
  if n <> 0 then raise exception 'A sees cohort of a draft result'; end if;
  select count(*) into n from public.peer_matches;
  if n <> 0 then raise exception 'A sees peer match of a draft result'; end if;
  reset role;

  -- service role approves A's and B's results
  update public.results set status = 'approved', approved_at = now() where id in (ra, rb);

  set local role authenticated;
  perform pg_temp.as_user(ua, 'Maya.Test+x@Gmail.com');
  select count(*) into n from public.results;
  if n <> 1 then raise exception 'A should see exactly their approved result, saw %', n; end if;
  if not exists (select 1 from public.results where id = ra) then raise exception 'A cannot see own approved result'; end if;
  if not exists (select 1 from public.cohorts where id = coh) then raise exception 'A cannot see own cohort'; end if;
  select count(*) into n from public.peer_matches;
  if n <> 1 then raise exception 'A should see their pair, saw %', n; end if;
  select count(*) into n from public.mou_signatures;
  if n <> 1 then raise exception 'A should see own MOU, saw %', n; end if;
  begin update public.results set status = 'approved' where id = ra; get diagnostics n = row_count; ok := (n = 0);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated could update results'; end if;
  begin insert into public.mou_signatures (result_id, cohort_id, typed_name, agreed, user_id) values (rb, coh, 'x', true, ua); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated could insert an MOU directly'; end if;
  begin delete from public.results where id = ra; get diagnostics n = row_count; ok := (n = 0);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated could delete results'; end if;

  -- user B: cannot see A's rows
  perform pg_temp.as_user(ub, 'bo@example.com');
  if exists (select 1 from public.results where id = ra) then raise exception 'B sees A result'; end if;
  if exists (select 1 from public.cohorts where id = coh) then raise exception 'B sees A cohort'; end if;
  if exists (select 1 from public.mou_signatures) then raise exception 'B sees A MOU'; end if;
  select count(*) into n from public.results;
  if n <> 1 then raise exception 'B should see only own result, saw %', n; end if;
  select count(*) into n from public.peer_matches;
  if n <> 1 then raise exception 'B should see the pair containing their result'; end if;

  -- user C: unconfirmed email -> nothing, even with an approved result
  perform pg_temp.as_user(uc, 'cy@example.com');
  select count(*) into n from public.portal_my_application_ids();
  if n <> 0 then raise exception 'unconfirmed user got % application ids', n; end if;
  select count(*) into n from public.results;
  if n <> 0 then raise exception 'unconfirmed user sees results'; end if;

  -- stranger: nothing
  perform pg_temp.as_user(gen_random_uuid(), 'nobody@example.com');
  select count(*) into n from public.results;
  if n <> 0 then raise exception 'stranger sees results'; end if;
  reset role;

  -- Test-row application behaves like any other
  update public.results set status = 'approved' where id = rt;
  set local role authenticated;
  perform pg_temp.as_user(ut, 'tess@example.com');
  if not exists (select 1 from public.results where id = rt) then raise exception 'Test-row owner cannot see their result'; end if;
  reset role;
end $$;

rollback;

-- save_guiding_answers check (venn-site #133). LOCAL db only; all rolls back.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); um uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  aa bigint; ab bigint; ad bigint; ap bigint; ra bigint; rb bigint; rd bigint; rp bigint; coh bigint; coh2 bigint;
  ok boolean; n int; ans text;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'maya@example.com', now()), (ub, 'bo@example.com', now()), (um, 'tm@example.com', now()), (ud, 'di@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Maya', 'maya@example.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Bo', 'bo@example.com', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Di', 'di@example.com', 'x', '/apply') returning id into ad;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Pia', 'pia@example.com', 'x', '/apply') returning id into ap;
  insert into public.cohorts (slug, name) values ('open', 'Open') returning id into coh;
  insert into public.cohorts (slug, name, guiding_cutoff) values ('closed', 'Closed', now() - interval '1 day') returning id into coh2;
  insert into public.results (application_id, outcome, cohort_id, status) values (aa, 'cohort', coh, 'approved') returning id into ra;
  insert into public.results (application_id, outcome, cohort_id, status) values (ab, 'cohort', coh2, 'approved') returning id into rb;
  insert into public.results (application_id, outcome, cohort_id) values (ad, 'cohort', coh) returning id into rd; -- draft
  insert into public.results (application_id, outcome, status) values (ap, 'peer', 'approved') returning id into rp;
  insert into public.team_members (lead_result_id, email_key, user_id) values (ra, 'tm@example.com', um);

  if has_function_privilege('anon', 'public.save_guiding_answers(bigint,jsonb)', 'execute')
     or has_function_privilege('public', 'public.save_guiding_answers(bigint,jsonb)', 'execute') then
    raise exception 'anon/public can execute save_guiding_answers';
  end if;

  -- owner saves and reads back (RLS select); a second save upserts, one row per key
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  select count(*) into n from public.save_guiding_answers(ra, '{"goal":"  Ship it ","skills":"React"}');
  if n <> 2 then raise exception 'save returned % rows, wanted 2', n; end if;
  perform public.save_guiding_answers(ra, '{"goal":"Ship it twice","availability":"Weekends"}');
  select count(*) into n from public.guiding_answers where result_id = ra;
  if n <> 3 then raise exception 'upsert left % rows, wanted 3', n; end if;
  select answer into ans from public.guiding_answers where result_id = ra and question = 'goal';
  if ans <> 'Ship it twice' then raise exception 'goal not updated (%)', ans; end if;

  -- invalid input rejected
  begin perform public.save_guiding_answers(ra, '{"bogus":"x"}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'unknown key accepted'; end if;
  begin perform public.save_guiding_answers(ra, '{"goal":"   "}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'blank answer accepted'; end if;
  begin perform public.save_guiding_answers(ra, jsonb_build_object('goal', repeat('x', 1001))); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'overlong answer accepted'; end if;
  begin perform public.save_guiding_answers(ra, '{"goal":5}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'non-text answer accepted'; end if;
  begin perform public.save_guiding_answers(ra, '{}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'empty object accepted'; end if;
  begin perform public.save_guiding_answers(ra, '["goal"]'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'non-object accepted'; end if;
  -- a bad key rolls the whole call back
  begin perform public.save_guiding_answers(ra, '{"skills":"changed","bogus":"x"}'); exception when invalid_parameter_value then null; end;
  select answer into ans from public.guiding_answers where result_id = ra and question = 'skills';
  if ans <> 'React' then raise exception 'partial write survived a rejected call'; end if;
  -- direct client writes are not granted
  begin insert into public.guiding_answers (result_id, question, answer) values (ra, 'goal', 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'client insert allowed'; end if;
  reset role;

  -- another user: refused on Maya's result, reads none of her rows; refused after the cutoff on their own
  perform pg_temp.as_user(ub, 'bo@example.com'); set local role authenticated;
  begin perform public.save_guiding_answers(ra, '{"goal":"hijack"}'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'another user saved on someone else''s result'; end if;
  select count(*) into n from public.guiding_answers; if n <> 0 then raise exception 'another user reads answers'; end if;
  begin perform public.save_guiding_answers(rb, '{"goal":"late"}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'save after cutoff accepted'; end if;
  reset role;

  -- team member reads the lead's answers but cannot write
  perform pg_temp.as_user(um, 'tm@example.com'); set local role authenticated;
  select count(*) into n from public.guiding_answers where result_id = ra; if n <> 3 then raise exception 'team member cannot read answers (%)', n; end if;
  begin perform public.save_guiding_answers(ra, '{"goal":"tm"}'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'team member wrote answers'; end if;
  reset role;

  -- draft result refused
  perform pg_temp.as_user(ud, 'di@example.com'); set local role authenticated;
  begin perform public.save_guiding_answers(rd, '{"goal":"x"}'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'draft result saved'; end if;
  reset role;

  -- an approved peer-outcome result is refused even for its owner (Maya, other season)
  insert into public.results (application_id, season, outcome, status) values (aa, 'spring-2027', 'peer', 'approved') returning id into rp;
  perform pg_temp.as_user(ua, 'maya@example.com'); set local role authenticated;
  begin perform public.save_guiding_answers(rp, '{"goal":"x"}'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'peer outcome saved'; end if;
  reset role;

  -- anon: no execute
  set local role anon;
  begin perform public.save_guiding_answers(ra, '{"goal":"x"}'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon saved'; end if;
  reset role;
end $$;

rollback;

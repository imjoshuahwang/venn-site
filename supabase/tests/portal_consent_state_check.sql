-- consent_state check for 20261123020000_portal_consent_state.sql + 20261123030000_portal_consent_state_application.sql (venn-site #127). LOCAL db only; all rolls back.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', em)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  s jsonb;
  good jsonb := '{"coordinator_groups":true,"highlights":false,"full_name_photo":false,"data_use":true,"retention":true}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'adult@example.com', now()), (ub, 'hs@example.com', now()), (uc, 'none@example.com', now());
  insert into public.applications (role, level, name, email, working_on, source)
    values ('student', 'college', 'Ann Adult', 'adult@example.com', 'x', '/apply'),
           ('student', 'high_school', 'Hal Student', 'hs@example.com', 'x', '/apply');

  if has_function_privilege('anon', 'public.consent_state(text)', 'execute')
     or has_function_privilege('public', 'public.consent_state(text)', 'execute') then
    raise exception 'anon/public can execute consent_state'; end if;
  if not has_function_privilege('authenticated', 'public.consent_state(text)', 'execute') then
    raise exception 'authenticated cannot execute consent_state'; end if;

  -- adult, nothing answered yet
  perform pg_temp.as_user(ua, 'adult@example.com'); set local role authenticated;
  s := public.consent_state('v1');
  if s->>'done' <> 'false' then raise exception 'adult done before consent: %', s; end if;
  if s->>'minor' <> 'false' then raise exception 'adult flagged minor: %', s; end if;
  if s->>'application' <> 'true' then raise exception 'adult application flag false: %', s; end if;
  if s->'answers' <> '{}'::jsonb then raise exception 'adult answers not empty: %', s; end if;

  -- adult after give_consent: done, answers round-trip, other version still empty
  perform public.give_consent(good, 'v1');
  s := public.consent_state('v1');
  if s->>'done' <> 'true' then raise exception 'adult not done after consent: %', s; end if;
  if s->'answers' <> good then raise exception 'answers do not match what was saved: %', s; end if;
  s := public.consent_state('v2');
  if s->>'done' <> 'false' or s->'answers' <> '{}'::jsonb then raise exception 'v1 consent leaked into v2: %', s; end if;
  reset role;

  -- high_school applicant: minor, not done, and ua's answers are not visible to them
  perform pg_temp.as_user(ub, 'hs@example.com'); set local role authenticated;
  s := public.consent_state('v1');
  if s->>'minor' <> 'true' then raise exception 'high_school not minor: %', s; end if;
  if s->>'done' <> 'false' or s->'answers' <> '{}'::jsonb then raise exception 'saw another user answers: %', s; end if;
  perform public.give_consent(good, 'v1');
  s := public.consent_state('v1');
  if s->>'done' <> 'true' or s->>'minor' <> 'true' then raise exception 'minor after consent wrong: %', s; end if;
  reset role;

  -- signed in but no application: not done, not minor
  perform pg_temp.as_user(uc, 'none@example.com'); set local role authenticated;
  s := public.consent_state('v1');
  if s->>'done' <> 'false' or s->>'minor' <> 'false' or s->>'application' <> 'false' then raise exception 'no-application state wrong: %', s; end if;
  reset role;
end $$;

rollback;

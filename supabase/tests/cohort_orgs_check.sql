-- cohort_orgs check for 20261121000000_cohort_orgs.sql (venn-site #119). LOCAL db only; all rolls back.
begin;
create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uz uuid := gen_random_uuid();
  aa bigint; ab bigint; az bigint; ra bigint; rb bigint; rz bigint; coh bigint; coh2 bigint; n int; ok boolean;
begin
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'a@example.com', now()), (ub, 'b@example.com', now()), (uz, 'z@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'A', 'a@example.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'B', 'b@example.com', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Z', 'z@example.com', 'x', '/apply') returning id into az;
  insert into public.cohorts (slug, name) values ('c1', 'One') returning id into coh;
  insert into public.cohorts (slug, name) values ('c2', 'Two') returning id into coh2;
  insert into public.results (application_id, outcome, cohort_id, status) values (aa, 'cohort', coh, 'approved') returning id into ra;
  insert into public.results (application_id, outcome, cohort_id, status) values (ab, 'cohort', coh, 'approved') returning id into rb;
  insert into public.results (application_id, outcome, cohort_id, status) values (az, 'cohort', coh2, 'draft') returning id into rz;

  perform pg_temp.as_user(ua, 'a@example.com'); set local role authenticated;
  select public.cohort_org_count(ra) into n;
  if n <> 2 then raise exception 'expected 2 orgs, got %', n; end if;
  -- someone else's result id is refused
  ok := false;
  begin perform public.cohort_org_count(rz); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'foreign result not refused'; end if;
  reset role;
  -- anon cannot execute
  if has_function_privilege('anon', 'public.cohort_org_count(bigint)', 'execute') then raise exception 'anon can execute'; end if;
end $$;
rollback;

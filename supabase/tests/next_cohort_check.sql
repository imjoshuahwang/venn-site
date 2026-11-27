-- Rejected journey (venn-site #279): next_cohort_by_token and next_cohort_opt_in. LOCAL db only; fake people; rolls back.
begin;
create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; end $$;

insert into applications (role, name, email, working_on) values
  ('student', 'Ada Test', 'ada-nc@example.com', 'x'), ('student', 'Ben Test', 'ben-nc@example.com', 'x'), ('student', 'Cy Test', 'cy-nc@example.com', 'x'), ('student', 'Di Test', 'di-nc@example.com', 'x');
insert into results (application_id, outcome, status)
  select id, case when email like 'di-%' then 'peer' else 'not_this_season' end, 'approved' from applications where email like '%-nc@example.com';
update results r set next_token_hash = repeat('a', 64), next_token_expires_at = now() + interval '1 day' from applications a where a.id = r.application_id and a.email like 'ada-%';
update results r set next_token_hash = repeat('b', 64), next_token_expires_at = now() - interval '1 day' from applications a where a.id = r.application_id and a.email like 'ben-%';
update results r set next_token_hash = repeat('c', 64), next_token_expires_at = now() + interval '1 day' from applications a where a.id = r.application_id and a.email like 'cy-%';

-- Only a not_this_season Result can hold a token.
do $$ begin
  update results r set next_token_hash = repeat('d', 64) from applications a where a.id = r.application_id and a.email like 'di-%';
  raise exception 'FAIL: peer result accepted a next token';
exception when check_violation then null; end $$;

select pg_temp.ok((select state = 'open' and first_name = 'Ada' from next_cohort_by_token(repeat('a', 64))), 'open + first name');
select pg_temp.ok((select state = 'expired' and first_name is null from next_cohort_by_token(repeat('b', 64))), 'expired, no name');
select pg_temp.ok((select state = 'unknown' and first_name is null from next_cohort_by_token(repeat('e', 64))), 'unknown token');
select pg_temp.ok((select state = 'unknown' from next_cohort_by_token(null)), 'null token is unknown');
select pg_temp.ok((select count(*) = 0 from results where next_opt_in_at is not null), 'GET changes nothing');

-- Opt in: first tap records, second tap is idempotent and keeps the first timestamp.
select pg_temp.ok((select state = 'done' and first_name = 'Ada' from next_cohort_opt_in(repeat('a', 64))), 'tap -> done');
create temp table t1 as select next_opt_in_at as at from results where next_token_hash = repeat('a', 64);
select pg_temp.ok((select at is not null from t1), 'opt-in recorded');
select pg_temp.ok((select state = 'done' from next_cohort_opt_in(repeat('a', 64))), 'second tap -> done');
select pg_temp.ok((select next_opt_in_at = (select at from t1) from results where next_token_hash = repeat('a', 64)), 'second tap changes nothing');
select pg_temp.ok((select state = 'done' from next_cohort_by_token(repeat('a', 64))), 'GET after tap -> done');
-- A tapped link stays done after it expires.
update results set next_token_expires_at = now() - interval '1 day' where next_token_hash = repeat('a', 64);
select pg_temp.ok((select state = 'done' and first_name = 'Ada' from next_cohort_by_token(repeat('a', 64))), 'done survives expiry');
select pg_temp.ok((select state = 'done' from next_cohort_opt_in(repeat('a', 64))), 'tap after expiry stays done');

-- Expired and unknown never record.
select pg_temp.ok((select state = 'expired' from next_cohort_opt_in(repeat('b', 64))), 'expired tap refused');
select pg_temp.ok((select state = 'unknown' from next_cohort_opt_in(repeat('e', 64))), 'unknown tap refused');
select pg_temp.ok((select state = 'unknown' from next_cohort_opt_in(null)), 'null tap refused');
select pg_temp.ok((select next_opt_in_at is null from results where next_token_hash = repeat('b', 64)), 'expired not recorded');

-- Unapproved result: unknown.
update results set status = 'draft' where next_token_hash = repeat('c', 64);
select pg_temp.ok((select state = 'unknown' from next_cohort_opt_in(repeat('c', 64))), 'unapproved result unknown');

-- Privileges: service role only; no anon or authenticated table or function access.
select pg_temp.ok(not has_function_privilege('anon', 'public.next_cohort_opt_in(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.next_cohort_opt_in(text)', 'execute')
  and not has_function_privilege('anon', 'public.next_cohort_by_token(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.next_cohort_by_token(text)', 'execute')
  and has_function_privilege('service_role', 'public.next_cohort_opt_in(text)', 'execute')
  and has_function_privilege('service_role', 'public.next_cohort_by_token(text)', 'execute'), 'function grants');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.results'::regclass) and not exists (select 1 from pg_policies where tablename = 'results' and 'anon' = any(roles) or tablename = 'results' and 'public' = any(roles)), 'results: RLS on, no anon policy');
select pg_temp.ok((select bool_and(prosecdef) from pg_proc where proname in ('next_cohort_opt_in', 'next_cohort_by_token')), 'security definer');
rollback;

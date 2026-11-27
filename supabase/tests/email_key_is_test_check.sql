-- email_key keeps an explicit +tag only for is_test applicants (#192); a planted test row never changes how clean or dotted addresses map.
--   bash supabase/tests/run_local.sh
begin;
create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;

insert into public.applications (role, name, email, working_on, source) values
  ('student', 'T Aws', 'qa.owner+aws@gmail.com', 'x', 'test'),
  ('student', 'T Quad', 'qa.owner+quadron@gmail.com', 'x', 'test'),
  ('student', 'Planted', 'v.ictim@gmail.com', 'x', 'test'),
  ('student', 'Real', 'real.person+promo@gmail.com', 'x', '/apply');

select pg_temp.ok(public.email_key('qa.owner+aws@gmail.com') = 'qa.owner+aws@gmail.com', 'test applicant keeps its +tag');
select pg_temp.ok(public.email_key('QA.owner+aws@gmail.com ') = 'qa.owner+aws@gmail.com', 'test match is case-insensitive and trimmed');
select pg_temp.ok(public.email_key('qa.owner+aws@gmail.com') <> public.email_key('qa.owner+quadron@gmail.com'), 'test applicants stay distinct');
select pg_temp.ok(public.email_key('qa.owner+peer@gmail.com') = 'qaowner@gmail.com', 'same owner, tag with no test row: stripped');
select pg_temp.ok((select email_key from public.applications where email = 'qa.owner+aws@gmail.com') = 'qa.owner+aws@gmail.com', 'insert trigger keys the test row by its tag');
select pg_temp.ok(public.email_key('v.ictim@gmail.com') = 'victim@gmail.com', 'planted test row cannot change how a dotted address maps');
select pg_temp.ok((select email_key from public.applications where email = 'v.ictim@gmail.com') = 'victim@gmail.com', 'untagged test row is keyed like anyone else');
select pg_temp.ok((select email_key from public.applications where email = 'real.person+promo@gmail.com') = 'realperson@gmail.com', 'real applicant: tag and dots stripped');
select pg_temp.ok(public.email_key('real.person+promo@gmail.com') = 'realperson@gmail.com', 'real applicant auth email still maps to the stripped key');
rollback;

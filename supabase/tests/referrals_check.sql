-- Referral ledger checks. Run against a LOCAL database with all migrations applied (never production:
-- inserting into applications fires the confirmation webhook). Raises on the first failure; rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/referrals_check.sql
-- Fake people only (example.com / example.org).
-- Local run (throwaway Postgres, no Docker): bash supabase/tests/run_local.sh
begin;

create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;

-- Referrer applies twice (two codes); friends split across both codes.
insert into applications (role, name, email, working_on) values ('student', 'Ann Test', 'ann@example.com', 'x');
insert into applications (role, name, email, working_on) values ('student', 'Ann Test', 'ANN@example.com', 'x');
create temp table codes as
  select id, ref_code, row_number() over (order by id) as n from applications where email_key = 'ann@example.com';

select pg_temp.ok((select bool_and(ref_code ~ '^ann-[a-hj-km-np-z2-9]{6}$') from codes), 'new codes are name + 6 chars');

-- 12 confirmed friends: 6 per code. Plus one bounced, one unconfirmed, one self (dot/plus variant).
insert into applications (role, name, email, working_on, referred_by)
  select 'student', 'Friend', 'f' || g || '@example.org', 'x',
         (select ref_code from codes where n = 1 + g % 2)
  from generate_series(1, 12) g;
insert into applications (role, name, email, working_on, referred_by)
  values ('student', 'Bouncy', 'bounce@example.org', 'x', (select upper(ref_code) || ' ' from codes where n = 1)),
         ('student', 'Slow', 'slow@example.org', 'x', (select ref_code from codes where n = 2)),
         ('student', 'Ann Again', 'ann+alt@example.com', 'x', (select ref_code from codes where n = 2));
update applications set confirmed_at = now() where email like 'f%@example.org' or email = 'bounce@example.org';
update applications set email_status = 'bounced' where email = 'bounce@example.org';

select pg_temp.ok((select count(distinct referrer_id) = 1 and count(*) = 15 from referral_ledger),
                  'both codes credit one referrer');
select pg_temp.ok((select referrer_id = (select id from codes where n = 1) from referral_ledger limit 1),
                  'referrer is the first application');
select pg_temp.ok((select l.status from referral_ledger l join applications a on a.id = l.applicant_id
                   where a.email = 'bounce@example.org') = 'bounced', 'bounced friend is not verified');
select pg_temp.ok((select l.status from referral_ledger l join applications a on a.id = l.applicant_id
                   where a.email = 'ann+alt@example.com') = 'self', 'plus-tag self referral');

select pg_temp.ok((select verified = 12 and credited = 10 and needs_review and pending = 1 and rejected = 2
                   from referral_stats where referrer_id = (select id from codes where n = 1)), 'cap 10 across both codes');
select pg_temp.ok((select verified = 0 from referral_stats where referrer_id = (select id from codes where n = 2)),
                  'second application has no separate cap');

-- /refer shows the same counts under either code, and no LinkedIn URL.
select pg_temp.ok((select (referral_status(ref_code)->>'referrals')::int = 12 and (referral_status(ref_code)->>'pending')::int = 1
                   from codes where n = 2), 'second code shows the person''s counts');
select pg_temp.ok((select not (referral_status(ref_code) ? 'linkedin_url') from codes where n = 1), 'no linkedin_url');
select pg_temp.ok(referral_status('nope-zzzzzz') is null, 'unknown code is null');
select pg_temp.ok(referral_status(null) is null, 'null code is null');

-- record_step: first URL wins; a later URL neither replaces it nor clears verified_at.
select record_step((select ref_code from codes where n = 1), 'linkedin', 'linkedin.com/posts/ann-1');
update referral_steps set verified_at = now() where application_id = (select id from codes where n = 1);
select record_step((select ref_code from codes where n = 1), 'linkedin', 'https://www.linkedin.com/posts/evil-2');
select record_step((select ref_code from codes where n = 1), 'linkedin', null);
select pg_temp.ok((select url = 'https://linkedin.com/posts/ann-1' and verified_at is not null from referral_steps
                   where application_id = (select id from codes where n = 1) and kind = 'linkedin'), 'url kept, verified kept');
do $$ begin
  perform record_step((select ref_code from codes where n = 1), null, null);
  raise exception 'FAIL: null kind accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

-- Old 4-char codes (already emailed) still resolve.
insert into applications (role, name, email, working_on, ref_code) values ('student', 'Bob Old', 'bob@example.com', 'x', 'bob-abcd');
insert into applications (role, name, email, working_on, referred_by) values ('student', 'Cy', 'cy@example.org', 'x', 'bob-abcd');
update applications set confirmed_at = now() where email = 'cy@example.org';
select pg_temp.ok((referral_status('bob-abcd')->>'referrals')::int = 1, 'legacy 4-char code works');
select pg_temp.ok(referrer_name(' BOB-ABCD ') = 'Bob', 'referrer_name trims and lowercases');

select 'referrals_check: all passed' as result;
rollback;

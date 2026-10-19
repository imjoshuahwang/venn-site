-- Referral credit needs a submitted share (20261020072000_credit_on_submit.sql, venn#302). LOCAL only; rolls back.
-- Local run (throwaway Postgres, no Docker): bash supabase/tests/run_local.sh
begin;

create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;
create function pg_temp.st(e text) returns text language sql as $$
  select l.status from referral_ledger l join applications a on a.id = l.applicant_id where a.email = e;
$$;

insert into applications (role, name, email, working_on) values ('student', 'Cara Test', 'cara@example.com', 'x');
insert into applications (role, name, email, working_on, referred_by)
  select 'student', 'Friend', e, 'x', (select ref_code from applications where email = 'cara@example.com')
  from unnest(array['pend@example.org', 'sub@example.org', 'late@example.org', 'void@example.org',
                    'legacy@example.org', 'bnc@example.org', 'unsent@example.org']) e;
update applications set confirmed_at = now() where email like '%@example.org' and email <> 'unsent@example.org';
update applications set share_status = 'submitted', share_submitted_at = now()
  where email in ('sub@example.org', 'bnc@example.org', 'unsent@example.org');
update applications set share_due = now() - interval '1 minute' where email = 'late@example.org';
update applications set share_status = 'void' where email = 'void@example.org';
update applications set share_status = null, share_due = null where email = 'legacy@example.org';
update applications set email_status = 'bounced' where email = 'bnc@example.org';

select pg_temp.ok(pg_temp.st('pend@example.org') = 'unconfirmed', 'email sent but share pending: not credited');
select pg_temp.ok(pg_temp.st('sub@example.org') = 'verified', 'share submitted: verified');
select pg_temp.ok(pg_temp.st('late@example.org') = 'void', 'pending past share_due: void');
select pg_temp.ok(pg_temp.st('void@example.org') = 'void', 'void share: void');
select pg_temp.ok(pg_temp.st('legacy@example.org') = 'verified', 'legacy row (no share rule) keeps old rule');
select pg_temp.ok(pg_temp.st('bnc@example.org') = 'bounced', 'bounced friend is not credited');
select pg_temp.ok(pg_temp.st('unsent@example.org') = 'unconfirmed', 'submitted but email never sent: not credited');
select pg_temp.ok((select verified = 2 and credited = 2 and pending = 2 and rejected = 3 from referral_stats
                   where ref_code = (select ref_code from applications where email = 'cara@example.com')), 'stats');

rollback;
select 'credit_check ok';

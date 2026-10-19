-- Referral ledger: a friend who applies as a club or company never gets the student confirmation email,
-- so they sat 'unconfirmed' (pending) forever. They are 'not_student' now: no credit, not pending.
-- Additive and safe to re-run. Same columns as before, so create or replace is enough.
create or replace view public.referral_ledger with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, a.id as applicant_id, a.created_at,
  case
    when a.email_key = r.email_key then 'self'
    when a.is_test or r.is_test then 'test'
    when a.role <> 'student' then 'not_student'
    when exists (select 1 from public.applications p where p.email_key = a.email_key and p.id < a.id) then 'duplicate'
    when split_part(a.email_key, '@', 2) in (select domain from public.disposable_domains) then 'disposable'
    when a.confirmed_at is null then 'unconfirmed'
    else 'verified'
  end as status
from public.applications a
join public.applications r on r.ref_code = a.referred_by;

create or replace view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status = 'unconfirmed') as pending,
  count(l.applicant_id) filter (where l.status in ('self', 'duplicate', 'disposable', 'not_student')) as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 10) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') > 10 as needs_review,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin') as linkedin_posted,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin' and s.verified_at is not null) as linkedin_verified
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
where not r.is_test
group by r.id;

revoke all on public.referral_ledger, public.referral_stats from anon, authenticated;

-- Referral credit only for a friend whose application is genuinely complete (venn#302, venn#322 point 2).
-- Before: a friend was 'verified' once their confirmation email was sent, so a referrer could farm credit with
-- made-up addresses. Now 'verified' also needs the friend's share to be submitted (share_status = 'submitted');
-- rows from before the share rule (share_status null) keep the old rule. A friend who never submits within 24h
-- ('void', or pending past share_due) is rejected as 'void', so pending counts expire instead of piling up.
-- Copied from 20261019030000_referral_redteam.sql; only the share lines are new. Same columns. Safe to re-run.

create or replace view public.referral_ledger with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, a.id as applicant_id, a.created_at,
  case
    when a.email_key = r.email_key then 'self'
    when a.is_test or r.is_test then 'test'
    when a.role <> 'student' then 'not_student'
    when exists (select 1 from public.applications p where p.email_key = a.email_key and p.id < a.id) then 'duplicate'
    when split_part(a.email_key, '@', 2) in (select domain from public.disposable_domains) then 'disposable'
    when a.email_status is not null then 'bounced'
    when a.share_status = 'void' or (a.share_status = 'pending_share' and now() > a.share_due) then 'void'
    when a.confirmed_at is null then 'unconfirmed'
    when a.share_status is not null and a.share_status <> 'submitted' then 'unconfirmed'
    else 'verified'
  end as status
from public.applications a
join public.applications c on c.ref_code = a.referred_by
left join lateral (select p.id from public.applications p
                   where p.email_key = c.email_key and p.is_test = c.is_test order by p.id limit 1) k on true
join public.applications r on r.id = coalesce(k.id, c.id);

create or replace view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status = 'unconfirmed') as pending,
  count(l.applicant_id) filter (where l.status in ('self', 'duplicate', 'disposable', 'not_student', 'bounced', 'void')) as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 10) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') > 10 as needs_review,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin') as linkedin_posted,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin' and s.verified_at is not null) as linkedin_verified
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
where not r.is_test
group by r.id;

revoke all on public.referral_ledger, public.referral_stats from anon, authenticated;

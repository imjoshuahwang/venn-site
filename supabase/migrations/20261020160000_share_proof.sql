-- venn#329: "posted on LinkedIn" means a saved post URL, not the legacy self-reported referral_steps 'linkedin' button
-- (rows exist that say posted with no post_url). referral_stats: linkedin_posted = post_url saved, new share_submitted,
-- linkedin_verified dropped (no readers). application_score: +5 only for a saved post URL. v_shares: service-role review view.

comment on table public.referral_steps is
  'LEGACY, self-reported: a row with kind=linkedin is an unproven "I posted" click. Proof of a post is applications.post_url.';

drop view public.referral_stats;
create view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status = 'unconfirmed') as pending,
  count(l.applicant_id) filter (where l.status in ('self', 'duplicate', 'disposable', 'not_student', 'bounced', 'void')) as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 10) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') > 10 as needs_review,
  r.post_url is not null as linkedin_posted,
  coalesce(r.share_status = 'submitted', false) as share_submitted
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
where not r.is_test
group by r.id;
revoke all on public.referral_stats from public, anon, authenticated;
grant select on public.referral_stats to service_role;

-- Same columns as before (venn/referrals.py reads application_score.linkedin); linkedin now needs a saved post URL.
create or replace view public.application_score with (security_invoker = on) as
select a.id as application_id, a.ref_code, x.linkedin, y.credited as referrals_credited,
  5 * x.linkedin::int + y.credited as score
from public.applications a
cross join lateral (select a.post_url is not null as linkedin) x
cross join lateral (select least(count(*), 10)::int as credited from public.referral_ledger l
  where l.referrer_id = a.id and l.status = 'verified') y
where not a.is_test;

create view public.v_shares with (security_invoker = on) as
select a.id, a.share_status, a.post_url, a.share_submitted_at, coalesce(s.verified, 0) as referrals_verified
from public.applications a
left join public.referral_stats s on s.referrer_id = a.id
where a.role = 'student' and not a.is_test;
revoke all on public.v_shares from public, anon, authenticated;
grant select on public.v_shares to service_role;

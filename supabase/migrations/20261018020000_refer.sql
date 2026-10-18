-- Refer (venn#254). /boost becomes /refer. Steps: applied, LinkedIn post, refer friends.
-- LinkedIn is a trusted claim (credited when the post link is saved, weight 5). A friend counts 1,
-- up to 10, once their application passes the fraud checks and their confirmation email was sent.
-- Test rows (applications.is_test) are excluded from stats and from credit on both sides.
-- The site (anon) never reads tables or views: only referral_status, record_step, referrer_name,
-- submit_application. Safe to re-run.

-- 1. Test rows. Set by rule on insert (a caller cannot choose it), backfilled below.
alter table public.applications add column if not exists is_test boolean not null default false;

create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.is_test := new.source = 'test'
    or split_part(lower(new.email), '@', 1) like '%+test%'
    or new.ref_code = 'minji-wzmf';
  return new;
end $$;

update public.applications
set is_test = coalesce(source = 'test', false)
  or split_part(lower(email), '@', 1) like '%+test%'
  or ref_code = 'minji-wzmf'
where is_test is distinct from (coalesce(source = 'test', false)
  or split_part(lower(email), '@', 1) like '%+test%'
  or ref_code = 'minji-wzmf');

-- 2. boosts -> referral_steps. No X; email = they opened the friend composer (analytics, no credit).
do $$
begin
  if to_regclass('public.boosts') is not null and to_regclass('public.referral_steps') is null then
    alter table public.boosts rename to referral_steps;
  end if;
end $$;

drop view if exists public.referral_stats;
drop function if exists public.boost_status(text);
drop function if exists public.record_boost(text, text, text);

delete from public.referral_steps where kind = 'x';
alter table public.referral_steps drop constraint if exists boosts_kind_check;
alter table public.referral_steps drop constraint if exists referral_steps_kind_check;
alter table public.referral_steps add constraint referral_steps_kind_check check (kind in ('linkedin', 'email'));
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'boosts_application_id_kind_key') then
    alter table public.referral_steps rename constraint boosts_application_id_kind_key to referral_steps_application_id_kind_key;
  end if;
end $$;
alter table public.referral_steps enable row level security;

-- 3. Ledger: one row per referred application, first matching status wins.
create or replace view public.referral_ledger with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, a.id as applicant_id, a.created_at,
  case
    when a.email_key = r.email_key then 'self'
    when a.is_test or r.is_test then 'test'
    when exists (select 1 from public.applications p where p.email_key = a.email_key and p.id < a.id) then 'duplicate'
    when split_part(a.email_key, '@', 2) in (select domain from public.disposable_domains) then 'disposable'
    when a.confirmed_at is null then 'unconfirmed'
    else 'verified'
  end as status
from public.applications a
join public.applications r on r.ref_code = a.referred_by;

-- 4. Stats for `venn referrals`: test referrers excluded; credited caps at 10, past that needs review.
-- pending = applied but confirmation not sent yet. rejected = self / duplicate / disposable.
create view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status = 'unconfirmed') as pending,
  count(l.applicant_id) filter (where l.status in ('self', 'duplicate', 'disposable')) as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 10) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') > 10 as needs_review,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin') as linkedin_posted,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin' and s.verified_at is not null) as linkedin_verified
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
where not r.is_test
group by r.id;

-- 5. Score = 5 * linkedin + min(credited referrals, 10). Test rows are left out.
create or replace view public.application_score with (security_invoker = on) as
select a.id as application_id, a.ref_code, x.linkedin, y.credited as referrals_credited,
  5 * x.linkedin::int + y.credited as score
from public.applications a
cross join lateral (select exists (select 1 from public.referral_steps s
  where s.application_id = a.id and s.kind = 'linkedin') as linkedin) x
cross join lateral (select least(count(*), 10)::int as credited from public.referral_ledger l
  where l.referrer_id = a.id and l.status = 'verified') y
where not a.is_test;

revoke all on public.referral_ledger, public.referral_stats, public.application_score,
  public.referral_steps, public.disposable_domains from anon, authenticated;

-- 6. Site API. A ref_code is a bearer token for its own /refer page: a first name and counts only.
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'linkedin_url', (select s.url from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = a.id and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = a.id and l.status = 'unconfirmed'))
  from applications a where a.ref_code = lower(trim(code))
$$;

create or replace function public.record_step(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; clean text := nullif(trim(coalesce(url, '')), '');
begin
  select id into app_id from applications where ref_code = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind not in ('linkedin', 'email') then raise exception 'unknown kind'; end if;
  if kind = 'linkedin' then
    if clean is null or clean !~* '^(https?://)?(www\.)?(linkedin\.com/(posts|feed/update)/|lnkd\.in/)[^\s]+$' then
      raise exception 'need a linkedin post link';
    end if;
    if clean !~* '^https?://' then clean := 'https://' || clean; end if;
  else
    clean := null;
  end if;
  insert into referral_steps (application_id, kind, url) values (app_id, record_step.kind, clean)
  on conflict on constraint referral_steps_application_id_kind_key do update
    set url = coalesce(excluded.url, referral_steps.url),
        verified_at = case when excluded.url is distinct from referral_steps.url then null else referral_steps.verified_at end;
  return referral_status(code);
end $$;

revoke all on function public.referral_status(text), public.record_step(text, text, text) from public;
grant execute on function public.referral_status(text), public.record_step(text, text, text) to anon, authenticated;

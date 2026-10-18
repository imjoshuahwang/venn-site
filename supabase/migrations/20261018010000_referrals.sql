-- Referrals that count (venn#254). Every applicant gets a short readable ref_code (maya-7k2).
-- /apply?ref=maya-7k2 stores it in referred_by. A referral is credited only when the referred person
-- submits an application of their own: not the referrer's email, not a repeat, not a throwaway domain.
-- Credit caps at 100 per referrer; past that the referrer needs review. The site (anon) never reads
-- the table: it goes through the four security-definer functions at the bottom.

alter table public.applications add column if not exists confirmed_at timestamptz;
alter table public.applications add column if not exists ref_code text unique;
alter table public.applications add column if not exists referred_by text check (length(referred_by) <= 40);
alter table public.applications add column if not exists email_key text;

-- One key per inbox: lowercase, drop +tags, drop gmail dots.
create or replace function public.email_key(e text) returns text language sql immutable as $$
  with p as (select split_part(lower(trim(e)), '@', 1) as u, split_part(lower(trim(e)), '@', 2) as d)
  select case when d in ('gmail.com', 'googlemail.com')
    then replace(split_part(u, '+', 1), '.', '') || '@gmail.com'
    else split_part(u, '+', 1) || '@' || d end
  from p
$$;

-- First name, letters only, max 12, then 4 chars with no look-alikes (no 0/o, 1/l/i).
create or replace function public.new_ref_code(full_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := left(regexp_replace(lower(split_part(trim(coalesce(full_name, '')), ' ', 1)), '[^a-z]', '', 'g'), 12);
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
begin
  if base = '' then base := 'venn'; end if;
  loop
    code := base || '-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                            from generate_series(1, 4));
    exit when not exists (select 1 from public.applications where ref_code = code);
  end loop;
  return code;
end $$;

create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  return new;
end $$;

drop trigger if exists applications_before_insert on public.applications;
create trigger applications_before_insert before insert on public.applications
  for each row execute function public.applications_before_insert();

do $$
declare r record;
begin
  for r in select id, name, email from public.applications where ref_code is null order by id loop
    update public.applications set ref_code = public.new_ref_code(r.name), email_key = public.email_key(r.email)
    where id = r.id;
  end loop;
end $$;

create index if not exists applications_referred_by on public.applications (referred_by);
create index if not exists applications_email_key on public.applications (email_key);

create table if not exists public.disposable_domains (domain text primary key);
alter table public.disposable_domains enable row level security;
insert into public.disposable_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('10minutemail.com'), ('temp-mail.org'), ('tempmail.com'),
  ('yopmail.com'), ('trashmail.com'), ('getnada.com'), ('sharklasers.com'), ('dispostable.com'),
  ('maildrop.cc'), ('throwawaymail.com'), ('fakeinbox.com'), ('mintemail.com'), ('emailondeck.com'),
  ('mohmal.com'), ('tempmailo.com'), ('burnermail.io'), ('spamgourmet.com'), ('mailnesia.com')
on conflict do nothing;

-- Boost steps the applicant took on /boost. email = they opened the composer (credit comes from
-- referrals); linkedin/x carry the post URL, verified_at is set by `venn referrals --verify` or Josh.
create table if not exists public.boosts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  application_id bigint not null references public.applications (id) on delete cascade,
  kind text not null check (kind in ('linkedin', 'x', 'email')),
  url text check (length(url) <= 500),
  verified_at timestamptz,
  unique (application_id, kind)
);
alter table public.boosts enable row level security;

-- One row per referred application, with why it does or does not count.
create or replace view public.referral_ledger with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, a.id as applicant_id, a.created_at,
  case
    when a.email_key = r.email_key then 'self'
    when exists (select 1 from public.applications p where p.email_key = a.email_key and p.id < a.id) then 'duplicate'
    when split_part(a.email_key, '@', 2) in (select domain from public.disposable_domains) then 'disposable'
    else 'verified'
  end as status
from public.applications a
join public.applications r on r.ref_code = a.referred_by;

create or replace view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status <> 'verified') as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 100) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') >= 100 as needs_review,
  bool_or(b.kind = 'linkedin') as linkedin_posted,
  bool_or(b.kind = 'linkedin' and b.verified_at is not null) as linkedin_verified,
  bool_or(b.kind = 'x') as x_posted,
  bool_or(b.kind = 'x' and b.verified_at is not null) as x_verified
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
left join public.boosts b on b.application_id = r.id
group by r.id;

revoke all on public.referral_ledger, public.referral_stats, public.boosts, public.disposable_domains
  from anon, authenticated;

-- Site API. A ref_code is a bearer token for its own boost page; it reveals a first name and counts only.
create or replace function public.referrer_name(code text) returns text
language sql stable security definer set search_path = public as $$
  select split_part(trim(name), ' ', 1) from applications where ref_code = lower(trim(code))
$$;

create or replace function public.submit_application(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  insert into applications (role, level, building, name, email, org, link, working_on, need, source, referred_by)
  values (payload->>'role', payload->>'level', payload->>'building', payload->>'name', payload->>'email',
          payload->>'org', payload->>'link', payload->>'working_on', payload->>'need', payload->>'source',
          payload->>'referred_by')
  returning ref_code into code;
  return code;
end $$;

create or replace function public.boost_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = a.id and l.status = 'verified'),
    'linkedin', exists (select 1 from boosts b where b.application_id = a.id and b.kind = 'linkedin'),
    'x', exists (select 1 from boosts b where b.application_id = a.id and b.kind = 'x'),
    'email', exists (select 1 from boosts b where b.application_id = a.id and b.kind = 'email'))
  from applications a where a.ref_code = lower(trim(code))
$$;

create or replace function public.record_boost(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; host text;
begin
  select id into app_id from applications where ref_code = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind not in ('linkedin', 'x', 'email') then raise exception 'unknown kind'; end if;
  host := lower(substring(coalesce(url, '') from '^https?://(?:www\.)?([^/?#]+)'));
  if kind = 'linkedin' and (host is null or host not in ('linkedin.com', 'lnkd.in')) then
    raise exception 'need a linkedin.com post link';
  end if;
  if kind = 'x' and (host is null or host not in ('x.com', 'twitter.com')) then
    raise exception 'need an x.com post link';
  end if;
  insert into boosts (application_id, kind, url) values (app_id, record_boost.kind, nullif(record_boost.url, ''))
  on conflict on constraint boosts_application_id_kind_key do update
    set url = coalesce(excluded.url, boosts.url),
        verified_at = case when excluded.url is distinct from boosts.url then null else boosts.verified_at end;
  return boost_status(code);
end $$;

revoke all on function public.referrer_name(text), public.submit_application(jsonb), public.boost_status(text),
  public.record_boost(text, text, text) from public;
grant execute on function public.referrer_name(text), public.submit_application(jsonb), public.boost_status(text),
  public.record_boost(text, text, text) to anon, authenticated;

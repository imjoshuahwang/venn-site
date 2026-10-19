-- Share status (venn-site #22). An application is pending_share, submitted or void. A student submits with a
-- LinkedIn post URL or 2 verified friends. Rows from before this change keep share_status = null (legacy: no
-- clock, can still submit). Void is computed (pending and past share_due); the sweeper is a later migration.

alter table public.applications
  add column if not exists share_status text check (share_status in ('pending_share', 'submitted', 'void')),
  add column if not exists share_due timestamptz,
  add column if not exists post_url text,
  add column if not exists share_submitted_at timestamptz;

-- Copied from the latest applications_before_insert (20261018040000_refer_hardening.sql); the share lines are new.
create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.confirmed_at := null;
  new.status := 'new';
  new.is_test := coalesce(new.source = 'test', false)
    or coalesce(split_part(lower(new.email), '@', 1) like '%+test%', false)
    or coalesce(new.ref_code = 'minji-wzmf', false);
  new.share_status := 'pending_share';
  new.share_due := now() + interval '24 hours';
  new.post_url := null;
  new.share_submitted_at := null;
  return new;
end $$;

-- Funnel steps (written by submit_share now; record_step, views and the sweeper come later).
create table if not exists public.share_events (
  id bigserial primary key,
  ref_code text not null,
  step text not null check (step in ('opened', 'post_copied', 'li_opened', 'url_pasted', 'no_linkedin', 'friend_applied', 'submitted', 'void')),
  at timestamptz not null default now()
);
alter table public.share_events enable row level security;
revoke all on public.share_events from anon, authenticated;
revoke all on sequence public.share_events_id_seq from anon, authenticated;

-- Copied from 20261019060000_refer_friends_done.sql; new keys: share_status, share_due, friends_submitted, post_url_saved.
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'email', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'email'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'unconfirmed'),
    'share_status', case when a.share_status = 'pending_share' and now() > a.share_due then 'void' else a.share_status end,
    'share_due', a.share_due,
    'friends_submitted', (select count(*) from referral_ledger l
                          where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'
                            and (a.share_due is null or l.created_at <= a.share_due)),
    'post_url_saved', a.post_url is not null)
  from applications a
  left join lateral (select p.id from applications p
                     where p.email_key = a.email_key and p.is_test = a.is_test order by p.id limit 1) k on true
  where a.ref_code = lower(trim(code))
$$;

create or replace function public.submit_share(code text, post_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a applications%rowtype;
  clean text := nullif(trim(coalesce(post_url, '')), '');
  friends int;
begin
  select * into a from applications where ref_code = lower(trim(code)) for update;
  if a.id is null then raise exception 'unknown code'; end if;
  if a.share_status = 'submitted' then return referral_status(code); end if;
  if a.share_status = 'void' or (a.share_status = 'pending_share' and now() > a.share_due) then
    raise exception 'void';
  end if;
  if clean is not null and clean !~* '^(https?://)?(www\.)?linkedin\.com/(posts|feed/update)/\S+$' then
    clean := null;
    if (referral_status(code)->>'friends_submitted')::int < 2 then raise exception 'need a linkedin post link'; end if;
  end if;
  if clean is null and (referral_status(code)->>'friends_submitted')::int < 2 then
    raise exception 'need a linkedin post link';
  end if;
  if clean is not null and clean !~* '^https?://' then clean := 'https://' || clean; end if;
  update applications set share_status = 'submitted', share_submitted_at = now(), post_url = clean where id = a.id;
  insert into share_events (ref_code, step) values (a.ref_code, 'submitted');
  return referral_status(code);
end $$;

revoke all on function public.referral_status(text), public.submit_share(text, text) from public;
grant execute on function public.referral_status(text), public.submit_share(text, text) to anon, authenticated;

-- #192: test applicants (applications.is_test) keep their +tag in email_key, so imjoshuahwang+aws@gmail.com and its siblings
-- stay distinct portal accounts. Replaces the five hardcoded addresses of 20261126030000 with a rule keyed on the row's flag.
-- Real applicants are untouched: tags and gmail dots are still stripped for them. anon can insert a row with source = 'test', so the
-- rule only ever keeps an explicit +tag on Josh's own QA inbox (imjoshuahwang+<tag>@gmail.com): a planted test row can never change how a
-- clean, dotted or other +tagged address (the real applicants') maps, so it cannot lock a real user out or dodge the per-inbox rate limit.
create index if not exists applications_test_email on public.applications (lower(trim(email))) where is_test;

-- Every owner check calls email_key(auth email), so the function itself answers "is this address a test row?".
create or replace function public.email_key(e text) returns text language sql stable security definer set search_path = public as $$
  with p as (select lower(trim(e)) as n, split_part(lower(trim(e)), '@', 1) as u, split_part(lower(trim(e)), '@', 2) as d)
  select case
    when n ~ '^contact\+portal-[a-z0-9-]+@joinvenn\.org$' then n
    when n ~ '^imjoshuahwang\+[a-z0-9-]+@gmail\.com$' and exists (select 1 from public.applications a where a.is_test and lower(trim(a.email)) = n) then n
    when d in ('gmail.com', 'googlemail.com')
      then replace(split_part(u, '+', 1), '.', '') || '@gmail.com'
    else split_part(u, '+', 1) || '@' || d end
  from p
$$;

-- Copied from 20261020150000_sql_audit.sql; is_test is decided first so the new row's own key can follow it.
create or replace function public.applications_before_insert() returns trigger
language plpgsql as $$
begin
  new.is_test := coalesce(new.source = 'test', false)
    or coalesce(split_part(lower(new.email), '@', 1) like '%+test%', false)
    or coalesce(new.ref_code = 'minji-wzmf', false);
  new.email_key := case when new.is_test and lower(trim(new.email)) ~ '^imjoshuahwang\+[a-z0-9-]+@gmail\.com$' then lower(trim(new.email)) else public.email_key(new.email) end;
  new.referred_by := nullif(regexp_replace(lower(new.referred_by), '[^a-z0-9-]', '', 'g'), '');
  if new.referred_by is not null and not exists (select 1 from public.applications where ref_code = new.referred_by) then
    new.referred_by := null;
  end if;
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.page_token := replace(gen_random_uuid()::text, '-', '');
  new.confirmed_at := null;
  new.status := 'new';
  if new.role = 'student' then
    new.share_status := 'pending_share';
    new.share_due := now() + interval '24 hours';
  else
    new.share_status := null;
    new.share_due := null;
  end if;
  new.post_url := null;
  new.share_submitted_at := null;
  return new;
end $$;

-- Re-key test rows only (no deletes).
update public.applications set email_key = public.email_key(email)
  where is_test and email_key is distinct from public.email_key(email);

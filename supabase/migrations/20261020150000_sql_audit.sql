-- SQL audit (venn#329). Three fixes, tests in supabase/tests/audit_check.sql.
-- 1. post_key: a LinkedIn activity is one post whether pasted as /posts/<slug>-activity-<id>-xxxx or as
--    /feed/update/urn:li:activity:<id>; both now key to linkedin.com/activity/<id>, so one post cannot serve two inboxes.
-- 2. ?ref= keeps only [a-z0-9-] (ref_code's alphabet), so stray tabs/newlines/zero-width chars no longer lose credit.
-- 3. submit_share leaves non-students (no share rule) untouched instead of marking them submitted.

create or replace function public.post_key(u text) returns text
language sql immutable set search_path = '' as $$
  with a as (
    select rtrim(regexp_replace(regexp_replace(btrim(coalesce(u, '')), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '[?#].*$', ''), '/') as s
  ), b as (
    select s, lower(split_part(s, '/', 1)) as host, substr(s, length(split_part(s, '/', 1)) + 1) as path from a
  ), c as (
    select s, host, path, substring(lower(path) from 'activity[-:]([0-9]{10,})') as activity from b
  )
  select case
    when s = '' then null
    when host ~ '^((www|m|[a-z]{2})\.)?lnkd\.in$' then 'lnkd.in' || path
    when host ~ '^((www|m|[a-z]{2})\.)?linkedin\.com$' then
      case when activity is not null then 'linkedin.com/activity/' || activity
           else 'linkedin.com' || regexp_replace(lower(path), '^/(mwlite|embed)/feed/update/', '/feed/update/') end
    else lower(s)
  end
  from c
$$;

-- Re-key saved posts. Only the earliest row per key keeps it, so existing duplicates cannot fail the unique index.
update public.applications set post_key = null where post_key is not null;
update public.applications a set post_key = k.key
from (select id, public.post_key(post_url) as key,
             row_number() over (partition by public.post_key(post_url) order by id) as n
      from public.applications where post_url is not null) k
where a.id = k.id and k.key is not null and k.n = 1;

create or replace function public.applications_before_insert() returns trigger
language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(regexp_replace(lower(new.referred_by), '[^a-z0-9-]', '', 'g'), '');
  if new.referred_by is not null and not exists (select 1 from public.applications where ref_code = new.referred_by) then
    new.referred_by := null;
  end if;
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.page_token := replace(gen_random_uuid()::text, '-', '');
  new.confirmed_at := null;
  new.status := 'new';
  new.is_test := coalesce(new.source = 'test', false)
    or coalesce(split_part(lower(new.email), '@', 1) like '%+test%', false)
    or coalesce(new.ref_code = 'minji-wzmf', false);
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

create or replace function public.submit_share(code text, post_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a applications%rowtype;
  clean text := nullif(trim(coalesce(post_url, '')), '');
begin
  select * into a from applications where page_token = lower(trim(code)) for update;
  if a.id is null then raise exception 'unknown code'; end if;
  if a.share_status = 'submitted' or a.role <> 'student' then return referral_status(code); end if;
  if a.share_status = 'void' or (a.share_status = 'pending_share' and now() > a.share_due) then
    raise exception 'void';
  end if;
  -- A non-LinkedIn link counts as no link; 2 friends who submitted unlock the step without one.
  if clean !~* '^(https?://)?((www|m|[a-z]{2})\.)?(linkedin\.com/(posts|feed/update|pulse|embed/feed/update|mwlite/feed/update)/|lnkd\.in/)[^\s]+$' then
    clean := null;
  end if;
  if clean is null and (referral_status(code)->>'friends_submitted')::int < 2 then
    raise exception 'need a linkedin post link';
  end if;
  if clean !~* '^https?://' then clean := 'https://' || clean; end if;
  -- One post, one inbox: the same post already saved on another person's application is refused.
  if clean is not null and exists (
    select 1 from applications o
    where o.id <> a.id and o.email_key is distinct from a.email_key and o.post_url is not null
      and public.post_key(o.post_url) = public.post_key(clean)) then
    raise exception 'post already used';
  end if;
  begin
    update applications set share_status = 'submitted', share_submitted_at = now(), post_url = clean where id = a.id;
  exception when unique_violation then
    raise exception 'post already used';  -- a raced second inbox lost at the unique index
  end;
  insert into share_events (ref_code, step) values (a.ref_code, 'submitted');
  return referral_status(code);
end $$;

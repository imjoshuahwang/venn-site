-- Page token (venn#303). The /refer page was keyed by ref_code, which is public (it is the ?ref= share code), so
-- anyone holding a shared link could open and edit someone else's page. The page now opens by a separate secret
-- page_token. ref_code stays public and only drives ?ref= sharing and referrer_name.
-- The RPC parameter is still named `code` so the client and the ?code= URL keep working; the value is now the token.
-- Old ?code=<ref_code> email links stop opening /refer on purpose. Deploy order: db push, site, send-confirmation.
-- Also here: one post, one inbox, enforced by the database (applications.post_key + a partial unique index).
-- Function bodies are based on the LATEST versions on s2s-pass: applications_before_insert from 20261019150000
-- (student-only share clock, referred_by check), the post-URL regex from the lnkd.in hotfix 20261020120000
-- (mirrors isLinkedInPostUrl in src/scripts/share-copy.ts), referral_ledger credit (20261020072000) is a view and
-- is untouched. Must stay later than 20261020120000. Safe to re-run.

alter table public.applications add column if not exists page_token text;
update public.applications set page_token = replace(gen_random_uuid()::text, '-', '') where page_token is null;
alter table public.applications alter column page_token set not null;
do $$ begin
  alter table public.applications add constraint applications_page_token_key unique (page_token);
exception when duplicate_table or duplicate_object then null; end $$;

-- post_key(url): the one normalization of a LinkedIn post link. Lowercase; drop scheme, query, fragment, trailing
-- slashes; drop a leading www./m./two-letter host prefix on linkedin.com and lnkd.in; mwlite/ and embed/ feed paths
-- fold onto feed/update/. lnkd.in short codes are case-sensitive, so their path keeps its case.
-- Not callable by clients; it runs inside security definer functions and the trigger below.
create or replace function public.post_key(u text) returns text language sql immutable set search_path = '' as $$
  with a as (
    select rtrim(regexp_replace(regexp_replace(btrim(coalesce(u, '')), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '[?#].*$', ''), '/') as s
  ), b as (
    select s, lower(split_part(s, '/', 1)) as host, substr(s, length(split_part(s, '/', 1)) + 1) as path from a
  )
  select case
    when s = '' then null
    when host ~ '^((www|m|[a-z]{2})\.)?(linkedin\.com|lnkd\.in)$' then
      regexp_replace(host, '^(www|m|[a-z]{2})\.', '') ||
      case when host ~ 'lnkd\.in$' then path
           else regexp_replace(lower(path), '^/(mwlite|embed)/feed/update/', '/feed/update/') end
    else lower(s)
  end
  from b
$$;
revoke execute on function public.post_key(text) from public, anon, authenticated;

alter table public.applications add column if not exists post_key text;

-- Keeps post_key in step with post_url. A second row of the SAME inbox (same email_key) holding an already-keyed post
-- gets no key, so a re-applied inbox is not blocked by itself (the old app rule); another inbox hits the index.
create or replace function public.applications_set_post_key() returns trigger language plpgsql set search_path = public as $$
begin
  new.post_key := public.post_key(new.post_url);
  if new.post_key is not null and exists (
    select 1 from public.applications o where o.id <> new.id and o.post_key = new.post_key and o.email_key = new.email_key) then
    new.post_key := null;
  end if;
  return new;
end $$;
revoke execute on function public.applications_set_post_key() from public, anon, authenticated;
drop trigger if exists applications_post_key on public.applications;
create trigger applications_post_key before update of post_url on public.applications
  for each row execute function public.applications_set_post_key();

-- Push safety: prod may already hold the same post on two rows, which would make a plain unique index fail the push.
-- Backfill the key for the EARLIEST row per post only; later duplicates stay null (their post_url is kept).
update public.applications a set post_key = public.post_key(a.post_url)
from (select id, row_number() over (partition by public.post_key(post_url) order by id) as rn
      from public.applications where post_url is not null) d
where d.id = a.id and d.rn = 1 and a.post_key is null;
create unique index if not exists applications_post_key_key on public.applications (post_key) where post_key is not null;

-- Copied from 20261019150000_referral_keys.sql; the page_token line is new. Always a fresh token, never the client's.
create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
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

-- Copied from 20261019070000_share_status.sql; lookup is by page_token. Still returns ref_code, never page_token.
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
  where a.page_token = lower(trim(code))
$$;

-- Copied from 20261019070000_share_status.sql; lookup by page_token, plus 'post already used'.
create or replace function public.submit_share(code text, post_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a applications%rowtype;
  clean text := nullif(trim(coalesce(post_url, '')), '');
  friends int;
begin
  select * into a from applications where page_token = lower(trim(code)) for update;
  if a.id is null then raise exception 'unknown code'; end if;
  if a.share_status = 'submitted' then return referral_status(code); end if;
  if a.share_status = 'void' or (a.share_status = 'pending_share' and now() > a.share_due) then
    raise exception 'void';
  end if;
  if clean is not null and clean !~* '^(https?://)?((www|m|[a-z]{2})\.)?(linkedin\.com/(posts|feed/update|pulse|embed/feed/update|mwlite/feed/update)/|lnkd\.in/)[^\s]+$' then
    clean := null;
    if (referral_status(code)->>'friends_submitted')::int < 2 then raise exception 'need a linkedin post link'; end if;
  end if;
  if clean is null and (referral_status(code)->>'friends_submitted')::int < 2 then
    raise exception 'need a linkedin post link';
  end if;
  if clean is not null and clean !~* '^https?://' then clean := 'https://' || clean; end if;
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

-- Copied from 20261019080000_share_steps.sql; lookup by page_token, share_events gets the row's real ref_code.
create or replace function public.record_step(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; real_ref text; clean text := nullif(trim(coalesce(url, '')), '');
begin
  select id, ref_code into app_id, real_ref from applications where page_token = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind is null or kind not in ('linkedin', 'email', 'opened', 'post_copied', 'li_opened', 'url_pasted', 'no_linkedin') then
    raise exception 'unknown kind';
  end if;
  if kind in ('opened', 'post_copied', 'li_opened', 'url_pasted', 'no_linkedin') then
    insert into share_events (ref_code, step) values (real_ref, record_step.kind) on conflict do nothing;
    return referral_status(code);
  end if;
  if kind = 'linkedin' then
    if clean is not null then
      if clean !~* '^(https?://)?((www|m|[a-z]{2})\.)?(linkedin\.com/(posts|feed/update|pulse|embed/feed/update|mwlite/feed/update)/|lnkd\.in/)[^\s]+$' then
        raise exception 'need a linkedin post link';
      end if;
      if clean !~* '^https?://' then clean := 'https://' || clean; end if;
    end if;
  else
    clean := null;
  end if;
  -- The first saved URL wins and verified_at is never cleared here (the hotfix's rule; the token is now private).
  insert into referral_steps (application_id, kind, url) values (app_id, record_step.kind, clean)
  on conflict on constraint referral_steps_application_id_kind_key do update
    set url = coalesce(referral_steps.url, excluded.url);
  return referral_status(code);
end $$;

-- Copied from 20261019010000_apply_idempotent.sql; returns page_token instead of ref_code.
create or replace function public.submit_application(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
  sid uuid := case when payload->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then (payload->>'session_id')::uuid end;
  v_name text := nullif(btrim(payload->>'name'), '');
  v_email text := nullif(btrim(payload->>'email'), '');
  v_work text := nullif(btrim(payload->>'working_on'), '');
begin
  -- The form already enforces these; only hand-made requests get here.
  if v_name is null or v_work is null then raise exception 'name and working_on are required' using errcode = '22023'; end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception 'email looks invalid' using errcode = '22023';
  end if;

  if sid is not null then
    perform pg_advisory_xact_lock(hashtextextended('submit_application:' || sid::text, 0));
    select a.page_token into code from applications a where a.session_id = sid order by a.id limit 1;
    if found then return code; end if;
  end if;

  insert into applications (role, level, building, name, email, org, link, working_on, need, source, referred_by, session_id)
  values (payload->>'role', nullif(btrim(payload->>'level'), ''), nullif(btrim(payload->>'building'), ''), v_name, v_email,
          nullif(btrim(payload->>'org'), ''), nullif(btrim(payload->>'link'), ''), v_work, nullif(btrim(payload->>'need'), ''),
          payload->>'source', payload->>'referred_by', sid)
  returning page_token into code;
  if sid is not null then
    insert into apply_events (session_id, step, event) values (sid, 'need', 'submit');
  end if;
  return code;
end $$;

revoke all on function public.referral_status(text), public.submit_share(text, text), public.record_step(text, text, text),
  public.submit_application(jsonb) from public;
grant execute on function public.referral_status(text), public.submit_share(text, text), public.record_step(text, text, text),
  public.submit_application(jsonb) to anon, authenticated;

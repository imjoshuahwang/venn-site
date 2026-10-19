-- Page token (venn#303). The /refer page was keyed by ref_code, which is public (it is the ?ref= share code), so
-- anyone holding a shared link could open and edit someone else's page. The page now opens by a separate secret
-- page_token. ref_code stays public and only drives ?ref= sharing and referrer_name.
-- The RPC parameter is still named `code` so the client and the ?code= URL keep working; the value is now the token.
-- Old ?code=<ref_code> email links stop opening /refer on purpose. Deploy order: db push, site, send-confirmation.

alter table public.applications add column if not exists page_token text;
update public.applications set page_token = replace(gen_random_uuid()::text, '-', '') where page_token is null;
alter table public.applications alter column page_token set not null;
do $$ begin
  alter table public.applications add constraint applications_page_token_key unique (page_token);
exception when duplicate_table or duplicate_object then null; end $$;

-- Copied from 20261019070000_share_status.sql; the page_token line is new. Always a fresh token, never the client's.
create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.page_token := replace(gen_random_uuid()::text, '-', '');
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
  if clean is not null and clean !~* '^(https?://)?(www\.)?linkedin\.com/(posts|feed/update)/\S+$' then
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
      and rtrim(regexp_replace(lower(trim(o.post_url)), '^(https?://)?(www\.)?', ''), '/')
        = rtrim(regexp_replace(lower(clean), '^(https?://)?(www\.)?', ''), '/')) then
    raise exception 'post already used';
  end if;
  update applications set share_status = 'submitted', share_submitted_at = now(), post_url = clean where id = a.id;
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
      if clean !~* '^(https?://)?(www\.)?(linkedin\.com/(posts|feed/update)/|lnkd\.in/)[^\s]+$' then
        raise exception 'need a linkedin post link';
      end if;
      if clean !~* '^https?://' then clean := 'https://' || clean; end if;
    end if;
  else
    clean := null;
  end if;
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

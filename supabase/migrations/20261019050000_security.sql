-- Red-team security (venn#254). The anon key ships in the site bundle, so treat anon as the public.
-- Anon may only EXECUTE the site RPCs (submit_application, log_apply_event, referrer_name,
-- referral_status, record_step); it reads and writes no table, view or sequence directly.
-- Adds: caps on submit_application (each insert mails a stranger's address, so a script = a spam cannon),
-- input checks, apply_events caps + pruning. Safe to re-run.

-- 1. Grants. Supabase grants anon/authenticated ALL on new tables and sequences by default; turn that off
--    and strip what is there. Functions are revoked one by one (other migrations grant their own RPCs).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke execute on function public.email_key(text), public.new_ref_code(text), public.applications_before_insert(),
  public.notify_send_confirmation() from public, anon, authenticated;

-- 2. v_apply_funnel ran as its owner (views bypass RLS unless security_invoker). Josh reads it as postgres anyway.
alter view public.v_apply_funnel set (security_invoker = on);

-- 3. Input checks the RPC does not do. NOT VALID: only new rows are checked, old rows stay.
--    One address per row (no lists, no spaces or newlines); no links or markup in the name that gets mailed.
alter table public.applications drop constraint if exists applications_email_shape;
alter table public.applications add constraint applications_email_shape
  check (email ~ '^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]+$') not valid;
alter table public.applications drop constraint if exists applications_name_plain;
alter table public.applications add constraint applications_name_plain
  check (name ~ '\S' and name !~ '[<>@\r\n\t]' and name !~* '(https?:|://|www\.)') not valid;
alter table public.applications drop constraint if exists applications_source_len;
alter table public.applications add constraint applications_source_len check (length(source) <= 500) not valid;

-- 4. Submit caps, for site callers only (JWT role anon/authenticated); Josh, the service role and the
--    SQL editor are never capped. Limits sit well above a 300-signups-an-hour launch:
--    3 per inbox per day, 30 a minute / 600 an hour / 2000 a day overall, 40 an hour per IP.
--    The IP is cf-connecting-ip (set by Cloudflare, not spoofable); it is kept hashed for one hour only.
create index if not exists applications_created_at on public.applications (created_at);

create table if not exists public.submit_hits (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists submit_hits_ip_at on public.submit_hits (ip_hash, at);
create index if not exists submit_hits_at on public.submit_hits (at);
alter table public.submit_hits enable row level security;
revoke all on public.submit_hits from anon, authenticated;

create or replace function public.applications_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  ip text := nullif(trim(nullif(current_setting('request.headers', true), '')::jsonb->>'cf-connecting-ip'), '');
  h text;
begin
  if coalesce(claims->>'role', '') not in ('anon', 'authenticated') then return new; end if;
  if (select count(*) from applications where email_key = new.email_key and created_at > now() - interval '1 day') >= 3 then
    raise exception 'already applied with this email' using hint = 'rate_email';
  end if;
  if (select count(*) from applications where created_at > now() - interval '1 minute') >= 30
     or (select count(*) from applications where created_at > now() - interval '1 hour') >= 600
     or (select count(*) from applications where created_at > now() - interval '1 day') >= 2000 then
    raise exception 'too many applications right now, try again soon' using hint = 'rate_global';
  end if;
  if ip is not null then
    h := encode(sha256(convert_to('venn-submit:' || ip, 'UTF8')), 'hex');
    delete from submit_hits where at < now() - interval '1 hour';
    if (select count(*) from submit_hits where ip_hash = h) >= 40 then
      raise exception 'too many applications from this network, try again later' using hint = 'rate_ip';
    end if;
    insert into submit_hits (ip_hash) values (h);
  end if;
  return new;
end $$;

revoke execute on function public.applications_rate_limit() from public, anon, authenticated;

-- Fires after applications_before_insert (alphabetical), so new.email_key is set.
drop trigger if exists applications_rate_limit on public.applications;
create trigger applications_rate_limit before insert on public.applications
  for each row execute function public.applications_rate_limit();

-- 5. apply_events flood: the 1500/min cap allowed ~2M rows a day from random session ids.
--    Now 600 a minute and 30000 a day overall (about 1000 visitors' worth), events older than 60 days
--    are pruned on roughly 1 call in 500. Same signature, same grant; body otherwise unchanged.
create or replace function public.log_apply_event(p_session uuid, p_step text, p_event text, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_session is null or p_step is null or p_event is null then return; end if;
  if p_step not in ('role', 'level', 'building', 'name', 'email', 'org', 'link', 'working_on', 'need') then return; end if;
  if p_event not in ('view', 'answer', 'back', 'abandon', 'error') then return; end if; -- 'submit' is written by submit_application only
  if p_detail is not null and (length(p_detail) > 60 or p_detail !~ '^[a-z0-9_:.-]+$') then p_detail := 'invalid'; end if;
  if (select count(*) from apply_events where session_id = p_session) >= 80 then return; end if;
  if (select count(*) from apply_events where created_at > now() - interval '1 minute') >= 600 then return; end if;
  if (select count(*) from apply_events where created_at > now() - interval '1 day') >= 30000 then return; end if;
  if random() < 0.002 then delete from apply_events where created_at < now() - interval '60 days'; end if;
  insert into apply_events (session_id, step, event, detail) values (p_session, p_step, p_event, p_detail);
end $$;

revoke all on function public.log_apply_event(uuid, text, text, text) from public;
grant execute on function public.log_apply_event(uuid, text, text, text) to anon, authenticated;

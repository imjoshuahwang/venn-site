-- Apply funnel: where visitors stop in the one-question-per-screen form, and why. Additive only.

-- 1. "Email sent" at a glance in the table editor. Follows confirmed_at, which only the Edge Function
--    send-confirmation and venn confirm write (they never touch this column). Students only get the email.
alter table public.applications add column if not exists email_sent boolean generated always as (confirmed_at is not null) stored;

-- 2. The session that produced an application, to join it to its events.
alter table public.applications add column if not exists session_id uuid;

-- 3. Events: step ids and error codes only. Never names, emails or free text.
create table if not exists public.apply_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  step text not null check (step in ('role', 'level', 'building', 'name', 'email', 'org', 'link', 'working_on', 'need')),
  event text not null check (event in ('view', 'answer', 'back', 'abandon', 'submit', 'error')),
  detail text check (length(detail) <= 200 and detail ~ '^[a-z0-9_:.-]+$'),
  created_at timestamptz not null default now()
);
create index if not exists apply_events_session_idx on public.apply_events (session_id, id);
create index if not exists apply_events_created_idx on public.apply_events (created_at);

alter table public.apply_events enable row level security;
revoke all on public.apply_events from anon, authenticated;

-- Insert-only API for the site. Bad input is dropped silently: logging must never break the form.
-- Caps: 80 events per session, 1500 per minute overall.
create or replace function public.log_apply_event(p_session uuid, p_step text, p_event text, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_session is null or p_step is null or p_event is null then return; end if;
  if p_step not in ('role', 'level', 'building', 'name', 'email', 'org', 'link', 'working_on', 'need') then return; end if;
  if p_event not in ('view', 'answer', 'back', 'abandon', 'error') then return; end if; -- 'submit' is written by submit_application only
  if p_detail is not null and (length(p_detail) > 60 or p_detail !~ '^[a-z0-9_:.-]+$') then p_detail := 'invalid'; end if;
  if (select count(*) from apply_events where session_id = p_session) >= 80 then return; end if;
  if (select count(*) from apply_events where created_at > now() - interval '1 minute') >= 1500 then return; end if;
  insert into apply_events (session_id, step, event, detail) values (p_session, p_step, p_event, p_detail);
end $$;

-- 4. submit_application: same as before, plus the session link and a submit event written in the same transaction.
create or replace function public.submit_application(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
  sid uuid := case when payload->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then (payload->>'session_id')::uuid end;
begin
  insert into applications (role, level, building, name, email, org, link, working_on, need, source, referred_by, session_id)
  values (payload->>'role', payload->>'level', payload->>'building', payload->>'name', payload->>'email',
          payload->>'org', payload->>'link', payload->>'working_on', payload->>'need', payload->>'source',
          payload->>'referred_by', sid)
  returning ref_code into code;
  if sid is not null then
    insert into apply_events (session_id, step, event) values (sid, 'need', 'submit');
  end if;
  return code;
end $$;

revoke all on function public.log_apply_event(uuid, text, text, text) from public;
grant execute on function public.log_apply_event(uuid, text, text, text) to anon, authenticated;

-- 5. For Josh (SQL editor / table editor only; anon cannot read it).
--    reached = sessions that saw the step. dropped = sessions whose last step this was and never submitted.
--    Reason = the last error code at that step, else left_without_error (just closed or navigated away).
create or replace view public.v_apply_funnel as
with ord(step, n) as (values ('role', 1), ('level', 2), ('building', 3), ('name', 4), ('email', 5),
                             ('org', 6), ('link', 7), ('working_on', 8), ('need', 9)),
sess as (
  select session_id,
         bool_or(event = 'submit') as submitted,
         (array_agg(step order by id desc) filter (where event = 'view'))[1] as last_step
  from apply_events group by session_id
),
lost as (
  select s.last_step as step,
         coalesce((select e.detail from apply_events e
                   where e.session_id = s.session_id and e.event = 'error' and e.step = s.last_step
                   order by e.id desc limit 1), 'left_without_error') as reason
  from sess s where not s.submitted and s.last_step is not null
),
reason_n as (select step, reason, count(*) as c from lost group by 1, 2)
select o.n as step_no, o.step,
       (select count(distinct session_id) from apply_events where event = 'view' and step = o.step) as reached,
       (select count(*) from lost l where l.step = o.step) as dropped,
       (select string_agg(reason || ' x' || c, ', ' order by c desc, reason)
          from (select reason, c from reason_n r where r.step = o.step order by c desc, reason limit 3) t) as top_drop_reasons
from ord o
union all
select 10, 'SUBMITTED', count(*), null, null from sess where submitted
order by 1;

revoke all on public.v_apply_funnel from anon, authenticated;

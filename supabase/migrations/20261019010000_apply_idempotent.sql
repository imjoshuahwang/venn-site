-- Red-team apply: submit_application is idempotent per form session, and checks the shape of what it stores.
-- Starts from the latest definition (20261018060000_apply_funnel.sql). Safe to re-run.
--
-- Why: on a flaky phone network the insert can commit while the response is lost. The form then shows an error,
-- the student taps Send again, and a second row (new ref_code, second confirmation attempt) appears.
-- The form keeps the same session_id until a submit succeeds, so a repeat from the same session returns the
-- first row's ref_code instead of inserting. The advisory lock makes two in-flight copies wait for each other.

create index if not exists applications_session_id_idx on public.applications (session_id);

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
    select a.ref_code into code from applications a where a.session_id = sid order by a.id limit 1;
    if found then return code; end if;
  end if;

  insert into applications (role, level, building, name, email, org, link, working_on, need, source, referred_by, session_id)
  values (payload->>'role', nullif(btrim(payload->>'level'), ''), nullif(btrim(payload->>'building'), ''), v_name, v_email,
          nullif(btrim(payload->>'org'), ''), nullif(btrim(payload->>'link'), ''), v_work, nullif(btrim(payload->>'need'), ''),
          payload->>'source', payload->>'referred_by', sid)
  returning ref_code into code;
  if sid is not null then
    insert into apply_events (session_id, step, event) values (sid, 'need', 'submit');
  end if;
  return code;
end $$;

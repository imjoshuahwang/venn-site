-- Check for 20261020150000_rs_events.sql. Run against a LOCAL database with all migrations applied.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rs_events_check.sql   -> ends with 'rs_events_check ok'
-- Local run (throwaway Postgres, no Docker): bash supabase/tests/run_local.sh
begin;

do $$
declare r text; denied boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    denied := false;
    begin perform 1 from public.rs_events; exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception '% can select rs_events', r; end if;
    denied := false;
    begin
      insert into public.rs_events(event_id, email, kind, source) values ('x', 'a@b.com', 'bounced', 'resend-webhook');
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception '% can insert into rs_events', r; end if;
    reset role;
  end loop;

  -- The owner (stands in for the service role) can write.
  insert into public.rs_events(event_id, email, kind, source, detail)
    values ('svix_1', 'a@b.com', 'bounced', 'resend-webhook', 'Permanent/General');
  if (select count(*) from public.rs_events) <> 1 then raise exception 'insert did not land'; end if;

  denied := false;
  begin
    insert into public.rs_events(event_id, email, kind, source) values ('svix_1', 'a@b.com', 'bounced', 'resend-webhook');
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'duplicate event_id accepted'; end if;

  denied := false;
  begin
    insert into public.rs_events(event_id, email, kind, source) values ('svix_2', 'a@b.com', 'opened', 'resend-webhook');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'bad kind accepted'; end if;

  denied := false;
  begin
    insert into public.rs_events(event_id, email, kind, source) values ('svix_3', 'a@b.com', 'bounced', 'other');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'bad source accepted'; end if;
end $$;

select 'rs_events_check ok';
rollback;

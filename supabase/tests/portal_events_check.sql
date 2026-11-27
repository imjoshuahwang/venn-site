-- portal_event + portal_funnel (venn-site #235). LOCAL db only; all rolls back.
begin;
create function pg_temp.as_user(uid uuid, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', mail)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  aa bigint; ab bigint; ac bigint; ra bigint; rb bigint; rc bigint; co bigint; n int; bad text; p numeric;
begin
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'a@example.com', now()), (ub, 'b@example.com', now()), (uc, 'c@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'A', 'a@example.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'B', 'b@example.com', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'C', 'c@example.com', 'x', '/apply') returning id into ac;
  insert into public.cohorts (slug, name, company) values ('acme', 'Acme cohort', 'Acme') returning id into co;
  insert into public.results (application_id, outcome, cohort_id, status) values (aa, 'cohort', co, 'approved') returning id into ra;
  insert into public.results (application_id, outcome, status) values (ab, 'peer', 'approved') returning id into rb;
  insert into public.results (application_id, outcome, cohort_id, status) values (ac, 'cohort', co, 'approved') returning id into rc;

  -- grants: authenticated only
  if has_function_privilege('anon', 'public.portal_event(text)', 'execute') or has_function_privilege('public', 'public.portal_event(text)', 'execute') then
    raise exception 'anon/public can execute portal_event'; end if;
  if not has_function_privilege('authenticated', 'public.portal_event(text)', 'execute') then raise exception 'authenticated cannot execute'; end if;

  -- 1: twice, one row
  perform pg_temp.as_user(ua, 'a@example.com'); set local role authenticated;
  perform public.portal_event('link_opened'); perform public.portal_event('link_opened');
  reset role;
  select count(*) into n from public.portal_events where result_id = ra and step = 'link_opened';
  if n <> 1 then raise exception 'duplicate step stored % rows', n; end if;

  -- 2: unknown step raises; no session raises or stores nothing
  set local role authenticated;
  begin perform public.portal_event('hacked'); raise exception 'unknown step accepted';
  exception when raise_exception then if sqlerrm = 'unknown step accepted' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.portal_events;
  begin perform public.portal_event('password_set'); exception when others then null; end;
  if (select count(*) from public.portal_events) <> n then raise exception 'event stored with no session'; end if;

  -- seed funnel: A and C on Acme (A link+password, C link), B no cohort (link+reveal_started)
  perform pg_temp.as_user(ua, 'a@example.com'); set local role authenticated; perform public.portal_event('password_set'); reset role;
  perform pg_temp.as_user(uc, 'c@example.com'); set local role authenticated; perform public.portal_event('link_opened'); reset role;
  perform pg_temp.as_user(ub, 'b@example.com'); set local role authenticated;
  perform public.portal_event('link_opened'); perform public.portal_event('reveal_started'); reset role;

  -- 4: funnel shape, pct 100 at link_opened, split by partner
  select pct into p from public.portal_funnel where step = 'link_opened' and partner = 'Acme';
  if p <> 100 then raise exception 'link_opened pct = %', p; end if;
  select count into n from public.portal_funnel where step = 'password_set' and partner = 'Acme';
  select pct into p from public.portal_funnel where step = 'password_set' and partner = 'Acme';
  if n <> 1 or p <> 50 then raise exception 'password_set % / %', n, p; end if;
  select count into n from public.portal_funnel where step = 'reveal_started' and partner = 'none';
  if n <> 1 then raise exception 'none partner row missing'; end if;
  if has_table_privilege('authenticated', 'public.portal_funnel', 'select') or has_table_privilege('anon', 'public.portal_funnel', 'select')
     or has_table_privilege('authenticated', 'public.portal_events', 'select') or has_table_privilege('anon', 'public.portal_events', 'insert') then
    raise exception 'funnel or events reachable by clients'; end if;

  -- 3: no PII columns
  select string_agg(column_name, ',' order by ordinal_position) into bad from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_events';
  if bad <> 'step,result_id,at' then raise exception 'portal_events columns: %', bad; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'portal_events'
             and column_name ~* '(email|phone|name|ip|agent)') then raise exception 'PII-like column'; end if;
end $$;
rollback;

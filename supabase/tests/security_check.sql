-- Security check for 20261019050000_security.sql. Run against a LOCAL database with all migrations applied
-- (never prod: it inserts rows, which fires the confirmation webhook). Everything rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/security_check.sql   -> ends with 'security_check ok'
-- Local run (throwaway Postgres, no Docker): bash supabase/tests/run_local.sh
begin;

-- Act like PostgREST serving the public anon key.
create function pg_temp.as_anon(ip text default '203.0.113.7') returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('request.headers', json_build_object('cf-connecting-ip', ip)::text, true);
$$;
create function pg_temp.app(email text, name text default 'Maya Test') returns jsonb language sql as $$
  select jsonb_build_object('role', 'student', 'name', name, 'email', email, 'working_on', 'x', 'source', '/apply');
$$;

do $$
declare n int; ok boolean;
begin
  -- 1. anon has no table, view or sequence privilege in public, and can only run the site RPCs.
  select count(*) into n from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated');
  if n <> 0 then raise exception 'anon/authenticated still hold % table grants', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') else false end;
  if n <> 0 then raise exception 'anon can use % sequences', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname not in ('submit_application', 'log_apply_event', 'referrer_name', 'referral_status', 'record_step', 'submit_share');
  if n <> 0 then raise exception 'anon can execute % internal functions', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception '% public tables without RLS', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'v' and not coalesce('security_invoker=on' = any(c.reloptions), false);
  if n <> 0 then raise exception '% public views run as their owner', n; end if;

  -- 2. Input checks.
  perform pg_temp.as_anon('203.0.113.1');
  begin perform submit_application(pg_temp.app('a@b.com,c@d.com')); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'address list accepted'; end if;
  begin perform submit_application(pg_temp.app('ok@example.com', 'Win a prize at https://x.co')); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'link in name accepted'; end if;

  -- 3. Per-inbox cap: 3 a day (Gmail dots and +tags count as the same inbox).
  perform submit_application(pg_temp.app('cap.one@gmail.com'));
  perform submit_application(pg_temp.app('capone+a@gmail.com'));
  perform submit_application(pg_temp.app('c.a.p.o.n.e@gmail.com'));
  begin perform submit_application(pg_temp.app('capone@gmail.com')); ok := false;
  exception when raise_exception then ok := true; end;
  if not ok then raise exception 'fourth application for one inbox accepted'; end if;

  -- 4. Per-IP cap: 40 an hour (the 40 earlier hits are seeded directly).
  insert into submit_hits (ip_hash) select encode(sha256(convert_to('venn-submit:198.51.100.9', 'UTF8')), 'hex')
    from generate_series(1, 40);
  perform pg_temp.as_anon('198.51.100.9');
  begin perform submit_application(pg_temp.app('ip41@example.com')); ok := false;
  exception when raise_exception then ok := true; end;
  if not ok then raise exception '41st application from one IP accepted'; end if;

  -- 5. Not capped outside the site (SQL editor / service role / venn): fill the minute to 30.
  perform set_config('request.jwt.claims', '', true);
  for i in 1..27 loop perform submit_application(pg_temp.app('editor' || i || '@example.com')); end loop;

  -- 6. Global cap: 30 a minute.
  perform pg_temp.as_anon('192.0.2.50');
  begin perform submit_application(pg_temp.app('global@example.com')); ok := false;
  exception when raise_exception then ok := true; end;
  if not ok then raise exception 'global per-minute cap not enforced'; end if;

  -- 7. apply_events: per-session cap 80, garbage dropped.
  perform pg_temp.as_anon();
  for i in 1..100 loop perform log_apply_event('00000000-0000-0000-0000-000000000001', 'role', 'view'); end loop;
  perform log_apply_event('00000000-0000-0000-0000-000000000002', 'nope', 'view');
  select count(*) into n from apply_events where session_id in
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
  if n <> 80 then raise exception 'apply_events per-session cap: % rows', n; end if;
end $$;

-- 8. As the anon role itself: tables are closed, the site RPCs are open.
set local role anon;
do $$
declare ok boolean;
begin
  begin perform 1 from applications limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select applications'; end if;
  begin insert into apply_events (session_id, step, event) values (gen_random_uuid(), 'role', 'view'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can insert apply_events directly'; end if;
  begin perform email_key('x@y.z'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run email_key'; end if;
  perform referrer_name('nobody-zzzz');
  perform referral_status('nobody-zzzz');
end $$;
reset role;

select 'security_check ok';
rollback;

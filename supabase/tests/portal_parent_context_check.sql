-- parent_consent_context (#284, 20261128180000). LOCAL db only; all rolls back. Minors' data: only first name + cohort name, only for a known token.
begin;

do $$
declare
  hs uuid := gen_random_uuid();
  t text; n int; rec record; cols text; ok boolean; hash text;
  c1 bigint; c2 bigint; app bigint;
begin
  insert into auth.users (id, email, email_confirmed_at) values (hs, 'ctx-hs@example.com', now());
  insert into public.applications (role, level, name, email, working_on, source)
    values ('student', 'high_school', '  Hal  Quincy ', 'ctx-hs@example.com', 'secret project', '/apply') returning id into app;
  insert into public.cohorts (slug, name, company) values ('ctx-old', 'Old Cohort', 'OldCo') returning id into c1;
  insert into public.cohorts (slug, name, company) values ('ctx-new', 'New Cohort', 'NewCo') returning id into c2;
  insert into public.results (application_id, season, outcome, cohort_id, status, created_at)
    values (app, 'fall-2025', 'cohort', c1, 'approved', now() - interval '1 year'),
           (app, 'fall-2026', 'cohort', c2, 'approved', now());

  -- privileges: public revoked; only anon + authenticated (the page) may execute; no other role gains it
  if not has_function_privilege('anon', 'public.parent_consent_context(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.parent_consent_context(text)', 'execute') then
    raise exception 'page roles cannot execute parent_consent_context'; end if;
  if exists (select 1 from information_schema.routine_privileges
             where routine_schema = 'public' and routine_name = 'parent_consent_context'
               and grantee not in ('anon', 'authenticated', 'postgres')) then
    raise exception 'unexpected grantee on parent_consent_context'; end if;

  -- security definer with a pinned search_path, and exactly two output columns
  if not exists (select 1 from pg_proc where proname = 'parent_consent_context' and prosecdef
                 and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) then
    raise exception 'parent_consent_context not security definer with pinned search_path'; end if;
  select string_agg(a, ',' order by a) into cols
    from (select unnest(proargnames[1:0] || proargnames) a from pg_proc where proname = 'parent_consent_context') s
    where a in ('first_name', 'cohort_name', 'p_token');
  if cols <> 'cohort_name,first_name,p_token' then raise exception 'unexpected arg/column names %', cols; end if;
  if (select array_length(proargnames, 1) from pg_proc where proname = 'parent_consent_context') <> 3 then
    raise exception 'parent_consent_context returns more than first_name, cohort_name'; end if;

  set local role service_role;
  t := public.request_parent_consent(hs, 'parent@example.com');
  reset role;
  select token_hash into hash from public.parent_consents where user_id = hs;

  -- anon with the raw token: first word of the name only, latest cohort only
  set local role anon;
  select count(*) into n from public.parent_consent_context(t);
  select * into rec from public.parent_consent_context(t);
  reset role;
  if n <> 1 then raise exception 'expected one context row, got %', n; end if;
  if rec.first_name <> 'Hal' then raise exception 'first name wrong or leaks surname: %', rec.first_name; end if;
  if rec.cohort_name <> 'New Cohort' then raise exception 'cohort not latest: %', rec.cohort_name; end if;

  -- unknown token, empty token, null token, and the stored hash itself all return nothing
  set local role anon;
  select count(*) into n from public.parent_consent_context('nope');
  if n <> 0 then raise exception 'unknown token returned a row'; end if;
  select count(*) into n from public.parent_consent_context('');
  if n <> 0 then raise exception 'empty token returned a row'; end if;
  select count(*) into n from public.parent_consent_context(null);
  if n <> 0 then raise exception 'null token returned a row'; end if;
  select count(*) into n from public.parent_consent_context(hash);
  if n <> 0 then raise exception 'stored hash works as a token'; end if;
  reset role;

  -- still answers after signing (the "thank you" page), and a resent link kills the old token's context
  perform public.sign_parent_consent(t);
  select count(*) into n from public.parent_consent_context(t);
  if n <> 1 then raise exception 'signed token lost its context'; end if;

  -- an expired unsigned token returns nothing
  update public.parent_consents set signed_at = null, expires_at = now() - interval '1 minute' where user_id = hs;
  select count(*) into n from public.parent_consent_context(t);
  if n <> 0 then raise exception 'expired token returned a row'; end if;
  update public.parent_consents set signed_at = now() where user_id = hs;

  -- no result with a cohort yet: no row (page falls back to generic copy)
  delete from public.results where application_id = app;
  insert into public.results (application_id, outcome, status) values (app, 'peer', 'approved');
  select count(*) into n from public.parent_consent_context(t);
  if n <> 0 then raise exception 'peer-only result returned a cohort'; end if;
end $$;

rollback;

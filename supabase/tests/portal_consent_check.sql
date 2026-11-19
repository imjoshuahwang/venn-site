-- give_consent check for 20261120010000_portal_consent_rpc.sql (venn-site #127). LOCAL db only; all rolls back.
-- Counts run as the superuser (reset role) because the consents select policy needs an owned result.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  n int; ok boolean;
  good jsonb := '{"coordinator_groups":true,"highlights":false,"full_name_photo":false,"data_use":true,"retention":true}';
begin
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'a@example.com', now()), (ub, 'b@example.com', now());

  if has_function_privilege('anon', 'public.give_consent(jsonb,text)', 'execute')
     or has_function_privilege('public', 'public.give_consent(jsonb,text)', 'execute') then
    raise exception 'anon/public can execute give_consent'; end if;
  if not has_function_privilege('authenticated', 'public.give_consent(jsonb,text)', 'execute') then
    raise exception 'authenticated cannot execute give_consent'; end if;

  -- 5 rows for self only
  perform pg_temp.as_user(ua); set local role authenticated;
  perform public.give_consent(good, 'v1');
  reset role;
  select count(*) into n from public.consents where user_id = ua and version = 'v1';
  if n <> 5 then raise exception 'expected 5 rows, got %', n; end if;
  select count(*) into n from public.consents where version = 'v1';
  if n <> 5 then raise exception 'rows written for another user'; end if;
  select count(*) into n from public.consents where user_id = ua and accepted and clause in ('coordinator_groups', 'data_use', 'retention');
  if n <> 3 then raise exception 'required clauses not accepted'; end if;
  select count(*) into n from public.consents where user_id = ua and clause in ('highlights', 'full_name_photo') and not accepted;
  if n <> 2 then raise exception 'opt-outs not stored as false'; end if;

  -- idempotent: same version again keeps 5 rows, updates the answer
  set local role authenticated;
  perform public.give_consent(good || '{"highlights":true}', 'v1');
  reset role;
  select count(*) into n from public.consents where user_id = ua and version = 'v1';
  if n <> 5 then raise exception 'not idempotent, % rows', n; end if;
  select count(*) into n from public.consents where user_id = ua and clause = 'highlights' and accepted;
  if n <> 1 then raise exception 'update did not stick'; end if;

  -- unknown key, missing required and false required are rejected, nothing written
  set local role authenticated;
  begin perform public.give_consent(good || '{"bogus":true}', 'v2'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'unknown key accepted'; end if;
  begin perform public.give_consent(good - 'retention', 'v2'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'missing required accepted'; end if;
  begin perform public.give_consent(good || '{"data_use":false}', 'v2'); ok := false; exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'false required accepted'; end if;

  -- direct insert denied
  begin insert into public.consents (user_id, clause, accepted, version) values (ua, 'highlights', true, 'v9'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'direct insert allowed'; end if;
  reset role;
  select count(*) into n from public.consents where version in ('v2', 'v9');
  if n <> 0 then raise exception 'rejected call wrote rows'; end if;

  -- anon denied
  set local role anon;
  begin perform public.give_consent(good, 'v1'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon executed give_consent'; end if;
  reset role;
end $$;

rollback;

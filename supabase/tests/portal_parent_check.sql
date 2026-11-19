-- Parent co-sign RPCs (venn-site #128, 20261124010000_portal_parent_rpc.sql). LOCAL db only; all rolls back.
begin;

do $$
declare
  hs uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  t1 text; t2 text; n int; ok boolean; r text; rec record;
begin
  insert into auth.users (id, email, email_confirmed_at) values (hs, 'hs@example.com', now()), (ad, 'adult@example.com', now());
  insert into public.applications (role, level, name, email, working_on, source)
    values ('student', 'high_school', 'Hal', 'hs@example.com', 'x', '/apply'),
           ('student', 'college', 'Ann', 'adult@example.com', 'x', '/apply');

  -- the applicant's own role can never mint a token
  if has_function_privilege('authenticated', 'public.request_parent_consent(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.request_parent_consent(uuid,text)', 'execute') then
    raise exception 'browser roles can execute request_parent_consent'; end if;
  set local role authenticated;
  begin perform public.request_parent_consent(hs, 'p@example.com'); ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  if not ok then raise exception 'authenticated got a token'; end if;

  -- non-minor rejected
  set local role service_role;
  begin perform public.request_parent_consent(ad, 'p@example.com'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'non-minor accepted'; end if;

  -- one hashed row, 72h
  t1 := public.request_parent_consent(hs, 'Parent@Example.com');
  reset role;
  select * into rec from public.parent_consents where user_id = hs;
  if rec.token_hash = t1 or rec.token_hash <> encode(sha256(convert_to(t1, 'utf8')), 'hex') then raise exception 'token not stored as hash'; end if;
  if rec.parent_email <> 'parent@example.com' then raise exception 'email not normalised'; end if;
  if rec.expires_at < now() + interval '71 hours' or rec.expires_at > now() + interval '73 hours' then raise exception 'expiry not 72h'; end if;
  if public.parent_consent_state(t1) <> 'ok' then raise exception 'fresh token not ok'; end if;
  if public.parent_consent_state('nope') <> 'unknown' then raise exception 'bad token not unknown'; end if;

  -- resend kills the old link
  set local role service_role;
  t2 := public.request_parent_consent(hs, 'parent@example.com');
  reset role;
  if public.parent_consent_state(t1) <> 'expired' then raise exception 'old link survived resend'; end if;
  if public.sign_parent_consent(t1) <> 'expired' then raise exception 'expired token signed'; end if;

  -- anon can sign with the raw token, once
  set local role anon;
  if public.sign_parent_consent(t2) <> 'signed' then raise exception 'sign failed'; end if;
  if public.sign_parent_consent(t2) <> 'used' then raise exception 'token reused'; end if;
  reset role;
  select count(*) into n from public.parent_consents where user_id = hs and signed_at is not null;
  if n <> 1 then raise exception 'expected one signed row'; end if;

  -- no resend after signing
  set local role service_role;
  begin perform public.request_parent_consent(hs, 'parent@example.com'); ok := false; exception when unique_violation then ok := true; end;
  reset role;
  if not ok then raise exception 'request after signed accepted'; end if;

  -- time-expired token, then a fresh request works
  delete from public.parent_consents where user_id = hs;
  set local role service_role;
  t1 := public.request_parent_consent(hs, 'parent@example.com');
  reset role;
  update public.parent_consents set expires_at = now() - interval '1 minute' where user_id = hs;
  if public.sign_parent_consent(t1) <> 'expired' then raise exception 'lapsed token signed'; end if;
  set local role service_role;
  t2 := public.request_parent_consent(hs, 'parent@example.com');
  reset role;
  if public.parent_consent_state(t2) <> 'ok' then raise exception 'resend after expiry failed'; end if;
end $$;

rollback;

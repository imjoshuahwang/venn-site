-- Minor MOU RPCs (#224). LOCAL db only; rolls back.
begin;
do $$
declare
  hs uuid := gen_random_uuid(); ad uuid := gen_random_uuid(); s jsonb; ok boolean; n int;
  png text := encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 200), 'hex'), 'base64');
begin
  insert into auth.users (id, email, email_confirmed_at) values (hs, 'hs+x@example.com', now()), (ad, 'adult@example.com', now());
  insert into public.applications (role, level, name, email, working_on, source)
    values ('student', 'high_school', 'Hal', 'hs@example.com', 'x', '/apply'), ('student', 'college', 'Ann', 'adult@example.com', 'x', '/apply');

  -- parent email may not be the student's own, even with a +tag
  set local role service_role;
  begin perform public.request_parent_consent(hs, 'HS@example.com'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'own email accepted as parent'; end if;
  perform public.request_parent_consent(hs, 'mom@example.com');
  reset role;
  delete from public.parent_consents;

  -- adult refused
  perform set_config('request.jwt.claims', json_build_object('sub', ad)::text, true);
  set local role authenticated;
  begin perform public.minor_mou_sign('minor', png); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'adult signed'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', hs)::text, true);
  set local role authenticated;
  -- parent before minor, bad png, confirm without sigs
  begin perform public.minor_mou_sign('parent', png, 'Mom'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'parent signed first'; end if;
  begin perform public.minor_mou_sign('minor', 'AAAA'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'bad png accepted'; end if;
  begin perform public.minor_mou_confirm(); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'confirmed with no sigs'; end if;
  perform public.minor_mou_sign('minor', png);
  begin perform public.minor_mou_confirm(); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'confirmed with no parent'; end if;
  perform public.minor_mou_sign('parent', png, 'Mom Lee');
  perform public.minor_mou_confirm();
  s := public.minor_mou_state();
  if not ((s->>'minor')::boolean and (s->>'confirmed')::boolean and s->>'parent_name' = 'Mom Lee') then raise exception 'state %', s; end if;
  -- no direct table access
  begin perform 1 from public.minor_mou; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'table readable'; end if;

  -- a second user sees nothing of the first
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad)::text, true);
  set local role authenticated;
  s := public.minor_mou_state();
  if (s->>'minor')::boolean or (s->>'minor_signed')::boolean or (s->>'confirmed')::boolean then raise exception 'leak %', s; end if;
  reset role;
  select count(*) into n from public.minor_mou;
  if n <> 1 then raise exception 'rows %', n; end if;
end $$;
rollback;

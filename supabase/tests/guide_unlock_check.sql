-- Check for 20261111100000_guide_members.sql. Local: bash supabase/tests/run_local.sh -> 'guide_unlock_check ok'
begin;

insert into public.guide_locked(slug, html) values ('zz-test', '<p>SECRET-BODY</p>');

do $$
declare r text; t text; denied boolean; got text; n int;
begin
  set local role anon;
  -- anon: no direct table access
  foreach t in array array['guide_locked','members','guide_events','guide_unlock_log'] loop
    denied := false;
    begin execute format('select 1 from public.%I', t); exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'anon can select %', t; end if;
  end loop;
  denied := false;
  begin insert into public.guide_locked(slug, html) values ('x', 'y'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon can insert guide_locked'; end if;
  denied := false;
  begin insert into public.members(email, thing, guide_slug) values ('a@b.com', 't', 'zz-test'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon can insert members'; end if;
  denied := false;
  begin insert into public.guide_events(event, slug) values ('unlock', 'zz-test'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon can insert guide_events'; end if;

  -- anon can call both RPCs
  perform public.guide_event('guide_view', 'zz-test', 'judge_test');
  perform public.guide_event('form_start', 'zz-test');
  got := public.unlock_guide('zz-test', '  Kid@Example.COM ', '  my thing ', 'judge_test');
  if got <> '<p>SECRET-BODY</p>' then raise exception 'unlock did not return html: %', got; end if;
  -- same email again: same html, still one row
  got := public.unlock_guide('zz-test', 'kid@example.com', 'new thing', 'ref2');
  if got <> '<p>SECRET-BODY</p>' then raise exception 'second unlock differs'; end if;
  reset role;

  select count(*) into n from public.members where email = 'kid@example.com';
  if n <> 1 then raise exception 'expected 1 member row, got %', n; end if;
  if not exists (select 1 from public.members where email = 'kid@example.com' and guide_slug = 'zz-test'
      and thing = 'new thing' and ref = 'ref2' and tier = 'member') then
    raise exception 'member row wrong';
  end if;
  if (select count(*) from public.guide_events where slug = 'zz-test' and event = 'unlock') <> 2 then raise exception 'unlock events missing'; end if;
  if (select count(*) from public.guide_events where slug = 'zz-test' and event in ('guide_view','form_start')) <> 2 then raise exception 'view events missing'; end if;

  -- bad input raises
  set local role anon;
  foreach t in array array[
    $q$select public.unlock_guide('zz-test', 'notanemail', 'x', '')$q$,
    $q$select public.unlock_guide('zz-test', 'a@b', 'x', '')$q$,
    $q$select public.unlock_guide('zz-test', 'a b@c.com', 'x', '')$q$,
    $q$select public.unlock_guide('zz-test', '', 'x', '')$q$,
    $q$select public.unlock_guide('zz-test', 'ok@example.com', '   ', '')$q$,
    $q$select public.unlock_guide('zz-test', 'ok@example.com', repeat('x', 201), '')$q$,
    $q$select public.unlock_guide('zz-test', 'ok@example.com', 'x', '<script>')$q$,
    $q$select public.unlock_guide('zz-test', 'ok@example.com', 'x', 'UPPER')$q$,
    $q$select public.unlock_guide('zz-test', 'ok@example.com', 'x', repeat('a', 41))$q$,
    $q$select public.unlock_guide('zz-test', repeat('a', 250) || '@b.com', 'x', '')$q$,
    $q$select public.unlock_guide('no-such-slug', 'ok@example.com', 'x', '')$q$,
    $q$select public.guide_event('unlock', 'zz-test', '')$q$,
    $q$select public.guide_event('drop table', 'zz-test', '')$q$,
    $q$select public.guide_event('guide_view', 'no-such-slug', '')$q$,
    $q$select public.guide_event('guide_view', 'zz-test', 'BAD ref')$q$
  ] loop
    denied := false;
    begin execute t; exception when others then if sqlstate in ('22023','P0001') then denied := true; else raise; end if; end;
    if not denied then raise exception 'accepted bad input: %', t; end if;
  end loop;
  reset role;

  if exists (select 1 from public.members where email = 'ok@example.com') then raise exception 'bad input wrote a row'; end if;

  -- per-email daily cap: 5 unlocks, the 6th raises (2 already used by kid@)
  set local role anon;
  for n in 1..3 loop perform public.unlock_guide('zz-test', 'kid@example.com', 'x', ''); end loop;
  denied := false;
  begin perform public.unlock_guide('zz-test', 'kid@example.com', 'x', ''); exception when others then denied := sqlstate = 'P0001'; end;
  if not denied then raise exception 'email cap not enforced'; end if;
  reset role;

  -- per-slug hourly event cap: 2000
  insert into public.guide_events(event, slug) select 'guide_view', 'zz-test' from generate_series(1, 2000);
  set local role anon;
  denied := false;
  begin perform public.guide_event('guide_view', 'zz-test'); exception when others then denied := sqlstate = 'P0001'; end;
  if not denied then raise exception 'event cap not enforced'; end if;
  reset role;
end $$;

select 'guide_unlock_check ok';
rollback;

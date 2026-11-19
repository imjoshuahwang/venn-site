-- portal_rate_hit and portal_consume_link (venn-site #130). LOCAL db only; all rolls back.
begin;
do $$
declare n int; ok boolean; uid uuid := gen_random_uuid();
begin
  select public.portal_rate_hit('k1', 900) into n; if n <> 1 then raise exception 'first hit = %', n; end if;
  perform public.portal_rate_hit('k1', 900);
  select public.portal_rate_hit('k1', 900) into n; if n <> 3 then raise exception 'third hit = %', n; end if;
  select public.portal_rate_hit('k2', 900) into n; if n <> 1 then raise exception 'keys are not independent'; end if;
  update public.portal_rate_hits set hit_at = now() - interval '1 hour' where key = 'k1';
  select public.portal_rate_hit('k1', 900) into n; if n <> 1 then raise exception 'old hits still counted: %', n; end if;
  begin perform public.portal_rate_hit('', 900); raise exception 'empty key accepted';
  exception when raise_exception then if sqlerrm = 'empty key accepted' then raise; end if; end;

  insert into public.portal_links (user_id, token_hash) values (uid, 'live');
  insert into public.portal_links (user_id, token_hash, expires_at) values (uid, 'old', now() - interval '1 minute');
  select public.portal_consume_link('live') into ok; if ok is not true then raise exception 'live link refused'; end if;
  select public.portal_consume_link('live') into ok; if ok is not false then raise exception 'reused link accepted'; end if;
  select public.portal_consume_link('old') into ok; if ok is not false then raise exception 'expired link accepted'; end if;
  select public.portal_consume_link('unknown') into ok; if ok is not true then raise exception 'unknown hash should defer to GoTrue'; end if;

  if has_table_privilege('anon', 'public.portal_rate_hits', 'select') or has_table_privilege('authenticated', 'public.portal_rate_hits', 'insert') then
    raise exception 'rate table is reachable by clients';
  end if;
end $$;
rollback;

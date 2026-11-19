-- #130: rate-limit counters and single-use link consumption. Additive; every write is a security-definer RPC.
create table public.portal_rate_hits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);
create index portal_rate_hits_key_at on public.portal_rate_hits (key, hit_at);
alter table public.portal_rate_hits enable row level security;
revoke all on public.portal_rate_hits from public, anon, authenticated;
grant all on public.portal_rate_hits to service_role;

-- Records one request for a (hashed) key and returns how many the key made in the window, this one included.
create function public.portal_rate_hit(p_key text, p_window_seconds int) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 128 or p_window_seconds not between 1 and 86400 then
    raise exception 'bad rate key';
  end if;
  delete from public.portal_rate_hits where hit_at < now() - interval '1 day';
  insert into public.portal_rate_hits (key) values (p_key);
  select count(*)::int into n from public.portal_rate_hits
    where key = p_key and hit_at > now() - make_interval(secs => p_window_seconds);
  return n;
end $$;

-- True when the link may be used now (it is then marked used). False when it was already used or has expired.
-- A hash with no portal_links row is left to GoTrue's own single-use check and returns true.
create function public.portal_consume_link(p_token_hash text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare ok boolean;
begin
  if not exists (select 1 from public.portal_links where token_hash = p_token_hash) then return true; end if;
  update public.portal_links set used_at = now()
    where token_hash = p_token_hash and used_at is null and expires_at > now()
    returning true into ok;
  return coalesce(ok, false);
end $$;

revoke all on function public.portal_rate_hit(text, int), public.portal_consume_link(text) from public;
grant execute on function public.portal_rate_hit(text, int), public.portal_consume_link(text) to anon, authenticated, service_role;

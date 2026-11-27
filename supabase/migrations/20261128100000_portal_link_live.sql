-- Read-only twin of portal_consume_link: true when the link may still be used (no row, or unused and unexpired). Marks nothing,
-- so the callback can check, ask GoTrue to verify, and only then consume.
create function public.portal_link_live(p_token_hash text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.portal_links where token_hash = p_token_hash)
    or exists (select 1 from public.portal_links where token_hash = p_token_hash and used_at is null and expires_at > now())
$$;

revoke all on function public.portal_link_live(text) from public;
grant execute on function public.portal_link_live(text) to anon, authenticated, service_role;

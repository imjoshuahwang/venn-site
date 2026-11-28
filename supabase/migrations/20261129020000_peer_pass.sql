-- Decline is real (#323): peer_pass clears the caller's own "down", so get_my_peer withholds the partner email from both sides.
create function public.peer_pass(p_match_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare m public.peer_matches%rowtype;
begin
  select * into m from public.peer_matches where id = p_match_id;
  if not found or not (public.portal_is_lead(m.result_a) or public.portal_is_lead(m.result_b)) then
    raise exception 'peer match not found' using errcode = '42501';
  end if;
  if public.portal_is_lead(m.result_a) then
    update public.peer_matches set a_down_at = null where id = m.id;
  else
    update public.peer_matches set b_down_at = null where id = m.id;
  end if;
end $$;

revoke execute on function public.peer_pass(bigint) from public, anon;
grant execute on function public.peer_pass(bigint) to authenticated;

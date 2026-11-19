-- Peer card location (venn-site #144). Additive: nullable applications.state/country (nothing held them before),
-- and get_my_peer / peer_down gain partner_state, partner_country as the LAST two columns; existing columns keep name and order.
-- The return type changes, so both functions are dropped and recreated with the same bodies and the same grants.
alter table public.applications
  add column if not exists state text check (length(state) <= 100),
  add column if not exists country text check (length(country) <= 100);

drop function if exists public.peer_down(bigint);
drop function if exists public.get_my_peer(text);

create function public.get_my_peer(p_season text default 'fall-2026')
returns table (match_id bigint, partner_name text, partner_org text, partner_project text, why_matched text,
               i_am_down boolean, they_are_down boolean, partner_email text, partner_state text, partner_country text)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.id, m.why_matched,
           case when m.result_a = r.id then m.result_b else m.result_a end as partner_result,
           case when m.result_a = r.id then m.a_down_at else m.b_down_at end as my_down,
           case when m.result_a = r.id then m.b_down_at else m.a_down_at end as their_down
    from public.results r
    join public.peer_matches m on r.id in (m.result_a, m.result_b)
    where r.season = p_season and r.status = 'approved' and public.portal_owns_result(r.id)
    limit 1
  )
  select mine.id,
         case when mine.my_down is not null and mine.their_down is not null then a.name else split_part(btrim(a.name), ' ', 1) end,
         a.org,
         left(split_part(btrim(a.working_on), E'\n', 1), 160),
         mine.why_matched,
         mine.my_down is not null,
         mine.their_down is not null,
         case when mine.my_down is not null and mine.their_down is not null then a.email end,
         a.state,
         a.country
  from mine
  join public.results pr on pr.id = mine.partner_result and pr.status = 'approved'
  join public.applications a on a.id = pr.application_id
$$;

create function public.peer_down(p_match_id bigint)
returns table (match_id bigint, partner_name text, partner_org text, partner_project text, why_matched text,
               i_am_down boolean, they_are_down boolean, partner_email text, partner_state text, partner_country text)
language plpgsql security definer set search_path = '' as $$
declare m public.peer_matches%rowtype;
begin
  select * into m from public.peer_matches where id = p_match_id;
  if not found
     or not (public.portal_is_lead(m.result_a) or public.portal_is_lead(m.result_b))
     or not exists (select 1 from public.results r where r.id = m.result_a and r.status = 'approved')
     or not exists (select 1 from public.results r where r.id = m.result_b and r.status = 'approved') then
    raise exception 'peer match not found' using errcode = '42501';
  end if;
  if public.portal_is_lead(m.result_a) then
    update public.peer_matches set a_down_at = coalesce(a_down_at, now()) where id = m.id;
  else
    update public.peer_matches set b_down_at = coalesce(b_down_at, now()) where id = m.id;
  end if;
  return query select g.* from public.get_my_peer(m.season) g where g.match_id = m.id;
end $$;

revoke execute on function public.get_my_peer(text), public.peer_down(bigint) from public, anon;
grant execute on function public.get_my_peer(text), public.peer_down(bigint) to authenticated;

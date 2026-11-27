-- Peer triads (venn-site #189). A peer result may hold TWO partners: a triad A,B,C is three pair rows AB, AC, BC.
-- Each row keeps its own a_down_at/b_down_at, so peer_down(match_id) is unchanged. So: drop the one-row-per-result
-- uniques, keep the unordered pair unique, allow a result in at most two rows, and let get_my_peer return up to two.
alter table public.peer_matches
  drop constraint if exists peer_matches_result_a_key,
  drop constraint if exists peer_matches_result_b_key;

create unique index peer_matches_pair_key on public.peer_matches (least(result_a, result_b), greatest(result_a, result_b));

create or replace function public.peer_matches_one_pair() returns trigger language plpgsql set search_path = public as $$
declare x bigint;
begin
  -- Serialize pair writes: under READ COMMITTED, concurrent inserts would both pass the count below and commit.
  perform pg_advisory_xact_lock(hashtext('peer_matches_pair'));
  foreach x in array array[new.result_a, new.result_b] loop
    if (select count(*) from public.peer_matches p
        where p.id is distinct from new.id and x in (p.result_a, p.result_b)) >= 2 then
      raise exception 'a result can be in at most two peer pairs' using errcode = '23505';
    end if;
  end loop;
  return new;
end $$;

create or replace function public.get_my_peer(p_season text default 'fall-2026')
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
    order by m.id
    limit 2
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
  order by mine.id
$$;

revoke execute on function public.get_my_peer(text) from public, anon;
grant execute on function public.get_my_peer(text) to authenticated;

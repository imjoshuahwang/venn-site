-- #247: the student's own region (state, country) so the match stage opener can say "Finding your peer in Texas."
-- Security contract from #239 unchanged: same ownership via match_my_result, same peer gating; the new field is the caller's own data only.
drop function public.get_my_match(text);

create function public.get_my_match(p_season text default 'fall-2026')
returns table (match_id bigint, status text, fit jsonb, draft_message text, message text, learn text, viewed_at timestamptz,
               requested_at timestamptz, responded_at timestamptz, expires_at timestamptz, requests_used int, rematches_used int,
               peer_first_name text, peer_org text, peer_region text, peer_project text, peer_name text, peer_email text, peer_phone text, own_region text)
language plpgsql stable security definer set search_path = '' as $$
declare rid bigint := public.match_my_result(p_season);
begin
  return query
  select m.id, m.status,
         case when m.status in ('approved', 'revealed', 'requested', 'accepted') then m.fit end,
         case when m.status in ('approved', 'revealed') then m.draft_message end,
         m.message, m.learn, m.viewed_at, m.requested_at, m.responded_at, m.expires_at,
         (select count(*)::int from public.matches x where x.requester_result_id = rid and x.season = p_season and x.requested_at is not null),
         (select count(*)::int from public.matches x where x.requester_result_id = rid and x.season = p_season and x.prev_match_id is not null),
         case when s.show then split_part(btrim(a.name), ' ', 1) end,
         case when s.show then a.org end,
         case when s.show then nullif(concat_ws(', ', nullif(btrim(a.state), ''), nullif(btrim(a.country), '')), '') end,
         case when s.show then left(split_part(btrim(a.working_on), E'\n', 1), 160) end,
         case when s.show and m.status = 'accepted' then a.name end,
         case when s.show and m.status = 'accepted' then a.email end,
         case when s.show and m.status = 'accepted' then pr.phone end,
         (select nullif(concat_ws(', ', nullif(btrim(oa.state), ''), nullif(btrim(oa.country), '')), '') from public.results orr join public.applications oa on oa.id = orr.application_id where orr.id = rid)
  from public.matches m
  left join public.results pr on pr.id = m.peer_result_id
  left join public.applications a on a.id = pr.application_id
  cross join lateral (select m.peer_result_id is not null and m.status in ('approved', 'revealed', 'requested', 'accepted', 'declined', 'expired', 'withdrawn') as show) s
  where m.requester_result_id = rid and m.season = p_season and m.status <> 'draft'
  order by m.id desc limit 1;
end $$;

revoke all on function public.get_my_match(text) from public, anon, authenticated;
grant execute on function public.get_my_match(text) to authenticated;

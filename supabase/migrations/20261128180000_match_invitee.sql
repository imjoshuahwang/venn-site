-- The asked student answers from the portal (venn-site #307, lane #281). Reuses the token page's accept/decline logic: it moves into
-- one internal function keyed by match id, called by intro_respond (token, service) and match_answer (session, the asked student).
-- The asked student sees what the token page already shows them (first name, org, region, project, message); never contact before accept.

create function public.match_answer_core(p_match_id bigint, p_action text)
returns table (outcome text, requester_name text, requester_email text, requester_phone text, peer_name text, peer_email text, peer_phone text)
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if p_action is null or p_action not in ('accept', 'decline', 'report', 'optout') then raise exception 'unknown action' using errcode = '22023'; end if;
  perform set_config('venn.actor', 'peer', true);
  select * into m from public.matches where id = p_match_id for update;
  if m.id is null then outcome := 'unknown'; return next; return; end if;
  if m.status = 'requested' and m.expires_at <= now() then
    update public.matches set status = 'expired' where id = m.id;
    outcome := 'expired'; return next; return;
  end if;
  if m.status <> 'requested' and not (p_action = 'report' and m.status = 'accepted') then
    outcome := m.status; return next; return;
  end if;
  if p_action = 'accept' then
    if exists (select 1 from public.matches x where x.requester_result_id = m.peer_result_id and x.peer_result_id is not null
                 and x.status in ('draft', 'approved', 'revealed', 'requested'))
       or exists (select 1 from public.matches x where x.status = 'accepted' and x.id <> m.id
                 and (m.peer_result_id in (x.requester_result_id, x.peer_result_id) or m.requester_result_id in (x.requester_result_id, x.peer_result_id))) then
      outcome := 'busy'; return next; return;
    end if;
    update public.matches set status = 'accepted', responded_at = now() where id = m.id;
    perform set_config('venn.actor', 'system', true);
    update public.matches set status = 'declined', responded_at = now()
      where peer_result_id = m.peer_result_id and id <> m.id and status in ('requested', 'draft', 'approved', 'revealed');
    update public.matches set status = 'declined', responded_at = now()
      where requester_result_id = m.requester_result_id and id <> m.id and status in ('draft', 'approved', 'revealed', 'requested');
    perform set_config('venn.actor', 'peer', true);
    outcome := 'accepted';
    select qa.name, qa.email, qr.phone, pa.name, pa.email, pr.phone into requester_name, requester_email, requester_phone, peer_name, peer_email, peer_phone
      from public.results qr join public.applications qa on qa.id = qr.application_id,
           public.results pr join public.applications pa on pa.id = pr.application_id
      where qr.id = m.requester_result_id and pr.id = m.peer_result_id;
    return next; return;
  elsif p_action = 'decline' then
    update public.matches set status = 'declined', responded_at = now() where id = m.id;
  elsif p_action = 'report' then
    update public.matches set status = 'reported', responded_at = now() where id = m.id;
    insert into public.match_blocks (peer_result_id, application_id)
      select m.peer_result_id, r.application_id from public.results r where r.id = m.requester_result_id on conflict do nothing;
  else
    update public.matches set status = 'declined', responded_at = now() where id = m.id;
    update public.match_pool set opted_out_at = coalesce(opted_out_at, now()) where result_id = m.peer_result_id;
    insert into public.match_events (match_id, type, actor) values (m.id, 'opted_out', 'peer');
  end if;
  outcome := case p_action when 'decline' then 'declined' when 'report' then 'reported' else 'opted_out' end;
  return next;
end $$;

create or replace function public.intro_respond(p_token_hash text, p_action text)
returns table (outcome text, requester_name text, requester_email text, requester_phone text, peer_name text, peer_email text, peer_phone text)
language plpgsql security definer set search_path = '' as $$
declare mid bigint;
begin
  if p_action is null or p_action not in ('accept', 'decline', 'report', 'optout') then raise exception 'unknown action' using errcode = '22023'; end if;
  select id into mid from public.matches where token_hash = p_token_hash and p_token_hash is not null;
  if mid is null then outcome := 'unknown'; return next; return; end if;
  return query select * from public.match_answer_core(mid, p_action);
end $$;

-- Student side. Ownership: the caller leads the asked result. Accept or decline only; report and opt-out stay on the mailed link.
-- Returns the outcome word alone, so no contact crosses here; the intro mail goes out through the sweep.
create function public.match_answer(p_match_id bigint, p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.matches; o text;
begin
  if auth.uid() is null then raise exception 'no session' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline') then raise exception 'unknown action' using errcode = '22023'; end if;
  select * into m from public.matches where id = p_match_id;
  if m.id is null or m.peer_result_id is null or not public.portal_is_lead(m.peer_result_id) then
    raise exception 'match not found' using errcode = '42501';
  end if;
  select c.outcome into o from public.match_answer_core(m.id, p_action) c;
  return o;
end $$;

-- What the asked student sees: the newest ask addressed to them. Detail only while it is open; afterwards the state word alone.
create function public.get_my_incoming(p_season text default 'fall-2026')
returns table (match_id bigint, state text, requester_first_name text, requester_org text, requester_region text, requester_project text,
               message text, learn text, expires_at timestamptz, own_region text)
language plpgsql stable security definer set search_path = '' as $$
declare rid bigint := public.match_my_result(p_season);
begin
  return query
  select m.id,
         case when m.status = 'requested' and m.expires_at <= now() then 'expired' else m.status end,
         case when o.open then split_part(btrim(a.name), ' ', 1) end,
         case when o.open then a.org end,
         case when o.open then nullif(concat_ws(', ', nullif(btrim(a.state), ''), nullif(btrim(a.country), '')), '') end,
         case when o.open then left(split_part(btrim(a.working_on), E'\n', 1), 160) end,
         case when o.open then m.message end,
         case when o.open then m.learn end,
         m.expires_at,
         (select nullif(concat_ws(', ', nullif(btrim(oa.state), ''), nullif(btrim(oa.country), '')), '') from public.results orr join public.applications oa on oa.id = orr.application_id where orr.id = rid)
  from public.matches m
  join public.results qr on qr.id = m.requester_result_id
  join public.applications a on a.id = qr.application_id
  cross join lateral (select m.status = 'requested' and m.expires_at > now() as open) o
  where m.peer_result_id = rid and m.season = p_season and m.status in ('requested', 'accepted', 'declined', 'expired')
  order by m.id desc limit 1;
end $$;

revoke all on function public.match_answer_core(bigint, text), public.intro_respond(text, text), public.match_answer(bigint, text),
  public.get_my_incoming(text) from public, anon, authenticated;
grant execute on function public.intro_respond(text, text) to service_role;
grant execute on function public.match_answer(bigint, text), public.get_my_incoming(text) to authenticated;

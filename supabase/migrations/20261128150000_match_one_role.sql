-- One match role per student (venn-site #281, epic #242, contract #239). A student is the one asking or the one asked, never both,
-- holds at most one accepted peer, and cannot start a new ask once they have accepted one. SQL is the source of truth; the drafter mirrors it.
-- Open = draft, approved, revealed, requested (a row with a peer). Accepted locks both sides.

alter table public.match_pool alter column max_open set default 1;

-- A student's role right now, ignoring one row (the one being written).
create function public.match_role_conflict(p_requester bigint, p_peer bigint, p_ignore bigint) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.matches x where x.id is distinct from p_ignore and x.status = 'accepted'
                   and p_requester in (x.requester_result_id, x.peer_result_id)) then 'already_matched'
    when exists (select 1 from public.matches x where x.id is distinct from p_ignore and x.peer_result_id = p_requester
                   and x.status in ('draft', 'approved', 'revealed', 'requested')) then 'already_asked'
    when p_peer is null then null
    when exists (select 1 from public.matches x where x.id is distinct from p_ignore and x.status = 'accepted'
                   and p_peer in (x.requester_result_id, x.peer_result_id)) then 'peer_matched'
    when exists (select 1 from public.matches x where x.id is distinct from p_ignore and x.requester_result_id = p_peer
                   and x.peer_result_id is not null and x.status in ('draft', 'approved', 'revealed', 'requested')) then 'peer_asking'
    when exists (select 1 from public.matches x where x.id is distinct from p_ignore and x.peer_result_id = p_requester
                   and x.status = 'accepted') then 'already_matched'
  end
$$;
revoke all on function public.match_role_conflict(bigint, bigint, bigint) from public, anon, authenticated;

create or replace function public.matches_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare rq public.results%rowtype; pr public.results%rowtype; pool public.match_pool%rowtype; rq_minor boolean; pr_minor boolean; why text;
begin
  select * into rq from public.results where id = new.requester_result_id;
  if rq.id is null or rq.status <> 'approved' or rq.cohort_id is not null or rq.outcome = 'cohort' or rq.season <> new.season then
    raise exception 'only an approved student without a cohort partner can be matched' using errcode = '22023';
  end if;
  if new.peer_result_id is not null and (tg_op = 'INSERT' or new.peer_result_id is distinct from old.peer_result_id) then
    select * into pr from public.results where id = new.peer_result_id;
    select * into pool from public.match_pool where result_id = new.peer_result_id;
    if pr.id is null or pr.status <> 'approved' or pr.season <> new.season or pool.result_id is null
       or pool.opted_in_at is null or pool.opted_out_at is not null or pr.application_id = rq.application_id then
      raise exception 'that peer is not in the pool' using errcode = '22023';
    end if;
    select exists (select 1 from public.applications a where a.id = rq.application_id and a.level = 'high_school') into rq_minor;
    select exists (select 1 from public.applications a where a.id = pr.application_id and a.level = 'high_school') into pr_minor;
    if rq_minor <> pr_minor then
      raise exception 'minors are matched only with minors' using errcode = '22023';
    end if;
    if exists (select 1 from public.match_blocks b where b.peer_result_id = new.peer_result_id and b.application_id = rq.application_id) then
      raise exception 'that pair is blocked' using errcode = '22023';
    end if;
  end if;
  -- One role per student. The two ids are locked in order, so A->B and B->C in parallel serialize on B.
  if new.status in ('draft', 'approved', 'revealed', 'requested', 'unmatched') and (new.peer_result_id is not null or tg_op = 'INSERT')
     and (tg_op = 'INSERT' or new.peer_result_id is distinct from old.peer_result_id or new.requester_result_id is distinct from old.requester_result_id) then
    perform pg_advisory_xact_lock(hashtext('match_role:' || k)) from unnest(array(
      select distinct u from unnest(array[new.requester_result_id, new.peer_result_id]) u where u is not null order by 1)) k;
    why := public.match_role_conflict(new.requester_result_id, new.peer_result_id, new.id);
    if why is not null then
      raise exception 'one match role per student (%)', why using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- A student who is being asked answers first; a matched student is done. Reasons are plain so the page can show them.
create or replace function public.match_request(p_match_id bigint, p_message text, p_learn text default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id); pool public.match_pool%rowtype; msg text; lrn text; exp timestamptz; why text;
begin
  if m.status not in ('approved', 'revealed') or m.peer_result_id is null then
    raise exception 'this match cannot be sent' using errcode = '22023';
  end if;
  msg := public.match_text_clean(p_message, 40, 600);
  lrn := case when btrim(coalesce(p_learn, '')) = '' then null else public.match_text_clean(p_learn, 1, 300) end;
  if (select count(*) from public.matches x where x.requester_result_id = m.requester_result_id and x.season = m.season and x.requested_at is not null) >= 3 then
    raise exception 'request limit reached for this season' using errcode = '54000';
  end if;
  if (select count(*) from public.match_events e join public.matches x on x.id = e.match_id
        join public.results r on r.id = x.requester_result_id
      where e.type = 'request_sent' and e.at > now() - interval '1 day'
        and r.application_id in (select public.portal_my_application_ids())) >= 2 then
    raise exception 'too many requests today' using errcode = '54000';
  end if;
  why := public.match_role_conflict(m.requester_result_id, m.peer_result_id, m.id);
  if why = 'already_asked' then
    raise exception 'Someone has asked to meet you, so answer them first. You can ask once that is settled.' using errcode = '22023', detail = why;
  elsif why = 'already_matched' then
    raise exception 'You already have a match, so there is nothing more to send.' using errcode = '22023', detail = why;
  elsif why is not null then
    raise exception 'this peer is not available' using errcode = '22023', detail = why;
  end if;
  select * into pool from public.match_pool where result_id = m.peer_result_id for update;
  if pool.result_id is null or pool.paused_at is not null or pool.opted_out_at is not null
     or exists (select 1 from public.match_blocks b join public.results r on r.id = m.requester_result_id
                where b.peer_result_id = m.peer_result_id and b.application_id = r.application_id)
     or (select count(*) from public.matches x where x.peer_result_id = m.peer_result_id and x.status = 'requested' and x.expires_at > now()) >= pool.max_open then
    raise exception 'this peer is not available' using errcode = '22023';
  end if;
  exp := now() + interval '72 hours';
  update public.matches set status = 'requested', message = msg, learn = lrn, requested_at = now(), expires_at = exp where id = m.id;
  return exp;
end $$;

create or replace function public.match_rematch(p_match_id bigint) returns bigint language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id); nid bigint;
begin
  if m.status not in ('declined', 'expired') then raise exception 'this match cannot be redone' using errcode = '22023'; end if;
  if exists (select 1 from public.matches x where x.prev_match_id = m.id) then raise exception 'already redone' using errcode = '22023'; end if;
  if exists (select 1 from public.matches x where x.status = 'accepted' and m.requester_result_id in (x.requester_result_id, x.peer_result_id)) then
    raise exception 'You already have a match, so there is nothing more to send.' using errcode = '22023';
  end if;
  if (select count(*) from public.matches x where x.requester_result_id = m.requester_result_id and x.season = m.season and x.prev_match_id is not null) >= 2 then
    raise exception 'rematch limit reached for this season' using errcode = '54000';
  end if;
  insert into public.matches (season, requester_result_id, prev_match_id, status) values (m.season, m.requester_result_id, m.id, 'unmatched') returning id into nid;
  return nid;
end $$;

-- Accept now refuses a peer who has their own open ask ('busy'), and closes the peer's other pending asks with a decline
-- (the sweep then sends those requesters the kind decline mail), so one peer ends in one intro.
create or replace function public.intro_respond(p_token_hash text, p_action text)
returns table (outcome text, requester_name text, requester_email text, requester_phone text, peer_name text, peer_email text, peer_phone text)
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if p_action is null or p_action not in ('accept', 'decline', 'report', 'optout') then raise exception 'unknown action' using errcode = '22023'; end if;
  perform set_config('venn.actor', 'peer', true);
  select * into m from public.matches where token_hash = p_token_hash and p_token_hash is not null for update;
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

revoke all on function public.match_request(bigint, text, text), public.match_rematch(bigint), public.intro_respond(text, text) from public, anon, authenticated;
grant execute on function public.match_request(bigint, text, text), public.match_rematch(bigint) to authenticated;
grant execute on function public.intro_respond(text, text) to service_role;

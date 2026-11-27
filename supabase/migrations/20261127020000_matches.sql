-- Match data (venn-site #245, epic #242, contract #239). A Match offers a student who has no cohort partner one peer:
-- another approved Venn student from the opt-in pool. Venn relays; contact details move only after the peer accepts.
-- RLS on, no table grants to anon or authenticated; every read and write is a security-definer RPC. See ADR 0005.
-- Under-18 = applications.level = 'high_school' (ADR 0004; there is no birthday column).

create table public.match_pool (
  result_id bigint primary key references public.results (id) on delete cascade,
  opted_in_at timestamptz not null default now(),
  paused_at timestamptz,
  opted_out_at timestamptz,
  max_open int not null default 3 check (max_open between 1 and 3),
  is_test boolean not null default false
);

create table public.matches (
  id bigint generated always as identity primary key,
  season text not null default 'fall-2026',
  requester_result_id bigint not null references public.results (id) on delete cascade,
  peer_result_id bigint references public.match_pool (result_id) on delete cascade,
  prev_match_id bigint references public.matches (id),
  status text not null default 'draft' check (status in
    ('draft', 'approved', 'revealed', 'requested', 'accepted', 'declined', 'expired', 'withdrawn', 'reported', 'unmatched')),
  fit jsonb not null default '{}' check (
    jsonb_typeof(fit) = 'object'
    and (not fit ? 'together' or (jsonb_typeof(fit -> 'together') = 'array' and jsonb_array_length(fit -> 'together') <= 2))
    and (not fit ? 'common' or (jsonb_typeof(fit -> 'common') = 'array' and jsonb_array_length(fit -> 'common') <= 3))),
  draft_message text check (char_length(draft_message) <= 600),
  judge_score numeric,
  message text check (char_length(message) <= 600),
  learn text check (char_length(learn) <= 300),
  viewed_at timestamptz,
  requested_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  check (peer_result_id is not null or status in ('unmatched', 'draft')),
  check (peer_result_id is distinct from requester_result_id)
);
-- One open match per student per Season, and never the same peer twice for a student.
create unique index matches_one_open on public.matches (requester_result_id, season)
  where status in ('draft', 'approved', 'revealed', 'requested', 'unmatched');
create unique index matches_never_same_peer on public.matches (requester_result_id, peer_result_id) where peer_result_id is not null;
create index matches_peer_status on public.matches (peer_result_id, status);

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  type text not null check (type in ('draft', 'approved', 'revealed', 'stage_opened', 'wheel_done', 'card_opened', 'compose_opened',
    'request_sent', 'reminded', 'accepted', 'declined', 'expired', 'withdrawn', 'reported', 'unmatched', 'intro_sent', 'opted_out')),
  actor text not null check (actor in ('student', 'peer', 'venn', 'system')),
  at timestamptz not null default now(),
  meta jsonb not null default '{}'
);
create index match_events_match on public.match_events (match_id, at);

create table public.match_blocks (
  peer_result_id bigint not null references public.match_pool (result_id) on delete cascade,
  application_id bigint not null references public.applications (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (peer_result_id, application_id)
);

alter table public.match_pool enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.match_blocks enable row level security;
revoke all on public.match_pool, public.matches, public.match_events, public.match_blocks from public, anon, authenticated;
grant all on public.match_pool, public.matches, public.match_events, public.match_blocks to service_role;
-- No policies on purpose: nobody but the service role (which bypasses RLS) and the definer functions below touches a row.

-- Who may be matched. Requester: approved, no cohort partner. Peer: approved, in the pool, a different person.
-- Minors only with minors, adults only with adults, all in the same Season.
create function public.matches_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare rq public.results%rowtype; pr public.results%rowtype; pool public.match_pool%rowtype; rq_minor boolean; pr_minor boolean;
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
  return new;
end $$;
create trigger matches_guard before insert or update of requester_result_id, peer_result_id, season on public.matches
  for each row execute function public.matches_guard();

-- Every status change writes one match_events row (the audit log and the funnel). RPCs name the actor first via venn.actor.
create function public.matches_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  insert into public.match_events (match_id, type, actor)
    values (new.id, case new.status when 'requested' then 'request_sent' else new.status end,
            coalesce(nullif(current_setting('venn.actor', true), ''), 'system'));
  return new;
end $$;
create trigger matches_audit after insert or update of status on public.matches
  for each row execute function public.matches_audit();

-- User-written text: trimmed, length-capped, and refused if it carries a way to reach someone (email, phone, handle, link).
-- The error never echoes the text.
create function public.match_text_clean(p_text text, p_min int, p_max int) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(p_text, ''));
begin
  if char_length(t) < p_min or char_length(t) > p_max then
    raise exception 'text must be % to % characters', p_min, p_max using errcode = '22023';
  end if;
  if t ~ '@' or t ~* '(https?:|www\.|://)' or t ~* '\m[a-z0-9-]+\.(com|org|net|io|co|edu|me|ai|dev|app|us|uk|gg|ly|tv|xyz)\M'
     or t ~* '\mdot\s+(com|org|net|edu)\M' or t ~* '\m(gmail|yahoo|outlook|hotmail|icloud|proton(mail)?)\M'
     or t ~ '(\+?\d[\s().-]?){7,}'
     or t ~* '\m(insta(gram)?|snap(chat)?|tiktok|discord|whatsapp|telegram|linkedin|twitter)\M\s*(is|:|-|=)\s*\S' then
    raise exception 'contact details are shared after you both say yes' using errcode = '22023';
  end if;
  return t;
end $$;

-- The caller's own Result for a Season (lead only), or 42501.
create function public.match_my_result(p_season text) returns bigint language plpgsql stable security definer set search_path = '' as $$
declare rid bigint;
begin
  if auth.uid() is null then raise exception 'no session' using errcode = '42501'; end if;
  select r.id into rid from public.results r
    where r.season = p_season and r.status = 'approved' and public.portal_is_lead(r.id) order by r.id limit 1;
  if rid is null then raise exception 'match not found' using errcode = '42501'; end if;
  return rid;
end $$;

-- Locks and returns the caller's own match row, or 42501 (a stranger learns nothing about whether the id exists).
create function public.match_lock_mine(p_match_id bigint) returns public.matches language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if auth.uid() is null then raise exception 'no session' using errcode = '42501'; end if;
  select * into m from public.matches where id = p_match_id for update;
  if m.id is null or not public.portal_is_lead(m.requester_result_id) then
    raise exception 'match not found' using errcode = '42501';
  end if;
  perform set_config('venn.actor', 'student', true);
  return m;
end $$;

-- Student read. Draft rows are invisible. The other side's last name, email and phone appear only when status = accepted.
create function public.get_my_match(p_season text default 'fall-2026')
returns table (match_id bigint, status text, fit jsonb, draft_message text, message text, learn text, viewed_at timestamptz,
               requested_at timestamptz, responded_at timestamptz, expires_at timestamptz, requests_used int, rematches_used int,
               peer_first_name text, peer_org text, peer_region text, peer_project text, peer_name text, peer_email text, peer_phone text)
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
         case when s.show and m.status = 'accepted' then pr.phone end
  from public.matches m
  left join public.results pr on pr.id = m.peer_result_id
  left join public.applications a on a.id = pr.application_id
  cross join lateral (select m.peer_result_id is not null and m.status in ('approved', 'revealed', 'requested', 'accepted', 'declined', 'expired', 'withdrawn') as show) s
  where m.requester_result_id = rid and m.season = p_season and m.status <> 'draft'
  order by m.id desc limit 1;
end $$;

create function public.match_viewed(p_match_id bigint) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id);
begin
  if m.status not in ('approved', 'revealed', 'requested', 'accepted') then raise exception 'match not found' using errcode = '42501'; end if;
  update public.matches set viewed_at = coalesce(viewed_at, now()), status = case when status = 'approved' then 'revealed' else status end
    where id = m.id returning viewed_at into m.viewed_at;
  return m.viewed_at;
end $$;

-- Client-side funnel beats (once per match and type).
create function public.match_step(p_match_id bigint, p_type text) returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if p_type is null or p_type not in ('stage_opened', 'wheel_done', 'card_opened', 'compose_opened') then raise exception 'unknown step' using errcode = '22023'; end if;
  m := public.match_lock_mine(p_match_id);
  if m.status not in ('approved', 'revealed') then return; end if;
  if not exists (select 1 from public.match_events e where e.match_id = m.id and e.type = p_type) then
    insert into public.match_events (match_id, type, actor) values (m.id, p_type, 'student');
  end if;
end $$;

-- The student's request. One open per Season (index), 3 per Season, 2 per day, peer capacity, text rules, blocks.
create function public.match_request(p_match_id bigint, p_message text, p_learn text default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id); pool public.match_pool%rowtype; msg text; lrn text; exp timestamptz;
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

create function public.match_withdraw(p_match_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id);
begin
  if m.status <> 'requested' then raise exception 'nothing to withdraw' using errcode = '22023'; end if;
  update public.matches set status = 'withdrawn', responded_at = now() where id = m.id;
end $$;

-- After a decline or expiry: a fresh 'unmatched' row for the drafter to fill (max 2 per Season, one successor per row).
create function public.match_rematch(p_match_id bigint) returns bigint language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id); nid bigint;
begin
  if m.status not in ('declined', 'expired') then raise exception 'this match cannot be redone' using errcode = '22023'; end if;
  if exists (select 1 from public.matches x where x.prev_match_id = m.id) then raise exception 'already redone' using errcode = '22023'; end if;
  if (select count(*) from public.matches x where x.requester_result_id = m.requester_result_id and x.season = m.season and x.prev_match_id is not null) >= 2 then
    raise exception 'rematch limit reached for this season' using errcode = '54000';
  end if;
  insert into public.matches (season, requester_result_id, prev_match_id, status) values (m.season, m.requester_result_id, m.id, 'unmatched') returning id into nid;
  return nid;
end $$;

-- Freezes the match, hides contact, blocks the pair. Venn reads the 'reported' event.
create function public.match_report(p_match_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches := public.match_lock_mine(p_match_id);
begin
  if m.status not in ('requested', 'accepted') then raise exception 'nothing to report' using errcode = '22023'; end if;
  update public.matches set status = 'reported', responded_at = now() where id = m.id;
  insert into public.match_blocks (peer_result_id, application_id)
    select m.peer_result_id, r.application_id from public.results r where r.id = m.requester_result_id on conflict do nothing;
end $$;

-- Service side. The raw token never reaches the database or the client; the sender derives it and stores only its sha-256 hex.
-- Stores the hash for a freshly requested match and returns what the request mail needs (peer address included: service role only).
create function public.match_issue_token(p_match_id bigint, p_token_hash text)
returns table (peer_email text, peer_first_name text, requester_first_name text, requester_org text, requester_region text,
               message text, learn text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  perform set_config('venn.actor', 'venn', true);
  select * into m from public.matches where id = p_match_id for update;
  if m.id is null or m.status <> 'requested' or m.token_hash is not null then raise exception 'cannot issue' using errcode = '22023'; end if;
  update public.matches set token_hash = p_token_hash where id = m.id;
  return query
  select pa.email, split_part(btrim(pa.name), ' ', 1), split_part(btrim(qa.name), ' ', 1), qa.org,
         nullif(concat_ws(', ', nullif(btrim(qa.state), ''), nullif(btrim(qa.country), '')), ''), m.message, m.learn, m.expires_at
  from public.results qr join public.applications qa on qa.id = qr.application_id,
       public.results pr join public.applications pa on pa.id = pr.application_id
  where qr.id = m.requester_result_id and pr.id = m.peer_result_id;
end $$;

-- The token page's GET. Strictly read-only (stable); the state is derived, nothing is written.
create function public.intro_by_token(p_token_hash text)
returns table (state text, requester_first_name text, requester_org text, requester_region text, message text, learn text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when m.id is null then 'unknown'
              when m.status = 'requested' and m.expires_at <= now() then 'expired'
              when m.status = 'requested' then 'open' else m.status end,
         case when m.status = 'requested' and m.expires_at > now() then split_part(btrim(a.name), ' ', 1) end,
         case when m.status = 'requested' and m.expires_at > now() then a.org end,
         case when m.status = 'requested' and m.expires_at > now() then nullif(concat_ws(', ', nullif(btrim(a.state), ''), nullif(btrim(a.country), '')), '') end,
         case when m.status = 'requested' and m.expires_at > now() then m.message end,
         case when m.status = 'requested' and m.expires_at > now() then m.learn end,
         m.expires_at
  from (select 1) one
  left join public.matches m on m.token_hash = p_token_hash and p_token_hash is not null
  left join public.results r on r.id = m.requester_result_id
  left join public.applications a on a.id = r.application_id
$$;

-- The token page's POST. One row lock, so accept vs withdraw (or double clicks) resolve once; the loser gets the winner's state.
-- Contact columns are filled only when the outcome is 'accepted' (for the joint intro mail, sent by the service).
create function public.intro_respond(p_token_hash text, p_action text)
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
    update public.matches set status = 'accepted', responded_at = now() where id = m.id;
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

-- Hour-48 reminders and 72h expiries. Returns what is due; the mail sender acts on it.
create function public.match_sweep() returns table (match_id bigint, action text) language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('venn.actor', 'system', true);
  return query
    with ex as (update public.matches m set status = 'expired' where m.status = 'requested' and m.expires_at <= now() returning m.id)
    select ex.id, 'expire'::text from ex;
  return query
    with rm as (update public.matches m set reminded_at = now()
                where m.status = 'requested' and m.reminded_at is null and m.expires_at > now() and m.requested_at <= now() - interval '48 hours'
                returning m.id),
         ev as (insert into public.match_events as e (match_id, type, actor) select rm.id, 'reminded', 'system' from rm returning e.match_id)
    select rm.id, 'remind'::text from rm;
end $$;

-- The joint intro mail went out (idempotent).
create function public.match_intro_sent(p_match_id bigint) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.matches m where m.id = p_match_id and m.status = 'accepted')
     and not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.type = 'intro_sent') then
    insert into public.match_events (match_id, type, actor) values (p_match_id, 'intro_sent', 'venn');
  end if;
end $$;

-- Funnel: distinct matches that reached each event type, per Season. Service only.
create view public.match_funnel with (security_invoker = on) as
  select m.season, e.type, count(distinct e.match_id)::int as matches
  from public.match_events e join public.matches m on m.id = e.match_id
  group by m.season, e.type;
revoke all on public.match_funnel from public, anon, authenticated;
grant select on public.match_funnel to service_role;

revoke all on function public.matches_guard(), public.matches_audit(), public.match_text_clean(text, int, int), public.match_my_result(text),
  public.match_lock_mine(bigint) from public, anon, authenticated;
revoke all on function public.get_my_match(text), public.match_viewed(bigint), public.match_step(bigint, text),
  public.match_request(bigint, text, text), public.match_withdraw(bigint), public.match_rematch(bigint), public.match_report(bigint),
  public.match_issue_token(bigint, text), public.intro_by_token(text), public.intro_respond(text, text), public.match_sweep(),
  public.match_intro_sent(bigint) from public, anon, authenticated;
grant execute on function public.get_my_match(text), public.match_viewed(bigint), public.match_step(bigint, text),
  public.match_request(bigint, text, text), public.match_withdraw(bigint), public.match_rematch(bigint), public.match_report(bigint) to authenticated;
grant execute on function public.match_issue_token(bigint, text), public.intro_by_token(text), public.intro_respond(text, text),
  public.match_sweep(), public.match_intro_sent(bigint) to service_role;

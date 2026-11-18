-- Portal v1 (Fall '26 Results). Josh's calls on Nov 17:
--   * Each Applicant gets at most 1 track (a Cohort, seat_cap seats, default 20: "15, 20 per track if relevant") and at most 2 Peer matches.
--   * Not this Season can carry a news feature (results.outlet); Venn coordinates it.
-- Additive: no data is deleted. Drafts stay invisible to applicants (RLS from 20261118000000 still holds).

-- 1. Peers: up to 2 pairs per result, never the same pair twice.
alter table public.peer_matches drop constraint peer_matches_result_a_key;
alter table public.peer_matches drop constraint peer_matches_result_b_key;
create unique index peer_matches_unordered_pair
  on public.peer_matches (season, least(result_a, result_b), greatest(result_a, result_b));
create index peer_matches_result_a on public.peer_matches (result_a);
create index peer_matches_result_b on public.peer_matches (result_b);

create or replace function public.peer_matches_one_pair() returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  -- Same advisory lock as before: concurrent inserts must see each other before the count.
  perform pg_advisory_xact_lock(hashtext('peer_matches_pair'));
  select count(*) into n from public.peer_matches p
  where p.id is distinct from new.id and new.result_a in (p.result_a, p.result_b);
  if n >= 2 then raise exception 'a result can be in at most two peer pairs' using errcode = '23505'; end if;
  select count(*) into n from public.peer_matches p
  where p.id is distinct from new.id and new.result_b in (p.result_a, p.result_b);
  if n >= 2 then raise exception 'a result can be in at most two peer pairs' using errcode = '23505'; end if;
  return new;
end $$;

-- 2. Tracks: a Cohort holds at most seat_cap results (default 20). Prompts shown to members.
alter table public.cohorts add column seat_cap int not null default 20 check (seat_cap between 1 and 50);
alter table public.cohorts add column prompts text;

create function public.results_seat_cap() returns trigger language plpgsql set search_path = public as $$
declare n int; cap int;
begin
  if new.cohort_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.cohort_id is not distinct from old.cohort_id then return new; end if;
  perform pg_advisory_xact_lock(hashtext('results_seat_cap'), new.cohort_id::int);
  select seat_cap into cap from public.cohorts where id = new.cohort_id;
  select count(*) into n from public.results where cohort_id = new.cohort_id and id is distinct from new.id;
  if n >= cap then raise exception 'cohort % is full (% seats)', new.cohort_id, cap using errcode = '23514'; end if;
  return new;
end $$;
create trigger results_seat_cap before insert or update of cohort_id on public.results
  for each row execute function public.results_seat_cap();

-- 3. News feature for Not this Season.
alter table public.results add column outlet text check (length(outlet) <= 80);

-- 4. Ownership: exact address, except Gmail dots/plus (same mailbox). The shared email_key also drops "+tag"
--    on other domains, where a plus address can be a different person's mailbox, so the portal no longer uses it.
create function public.portal_owns_email(app_email text, jwt_email text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when split_part(lower(trim(jwt_email)), '@', 2) in ('gmail.com', 'googlemail.com')
      then public.email_key(app_email) = public.email_key(jwt_email)
    else lower(trim(app_email)) = lower(trim(jwt_email))
  end
$$;
revoke execute on function public.portal_owns_email(text, text) from public, anon, authenticated;

create or replace function public.portal_my_application_ids() returns setof bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id
  from public.applications a
  where a.email_key = public.email_key(auth.jwt() ->> 'email')
    and public.portal_owns_email(a.email, auth.jwt() ->> 'email')
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

-- 5. Portal RPCs. All security definer, authenticated only, and scoped to the caller's own approved result.

-- What the signed-in applicant sees. NULL result means no application, or no approved Result yet.
create function public.portal_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare app record; res public.results; coh public.cohorts; peers jsonb;
begin
  select a.id, a.name, a.org, a.role into app
  from public.applications a where a.id in (select public.portal_my_application_ids())
  -- Some people applied twice: prefer the application that carries an approved Result.
  order by exists (select 1 from public.results r where r.application_id = a.id and r.season = 'fall-2026'
                   and r.status = 'approved') desc, a.created_at desc
  limit 1;
  if app.id is null then return jsonb_build_object('application', false); end if;

  select * into res from public.results r
  where r.application_id = app.id and r.season = 'fall-2026' and r.status = 'approved';
  if res.id is null then
    return jsonb_build_object('application', true, 'first_name', split_part(app.name, ' ', 1), 'result', null);
  end if;

  if res.cohort_id is not null then select * into coh from public.cohorts where id = res.cohort_id; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'match_id', m.id,
      'name', pa.name,
      'org', pa.org,
      'building', pa.building,
      'why', m.why_matched,
      'me_down', (case when m.result_a = res.id then m.a_down_at else m.b_down_at end) is not null,
      'both_down', m.a_down_at is not null and m.b_down_at is not null,
      'email', case when m.a_down_at is not null and m.b_down_at is not null then pa.email end
    ) order by m.id), '[]'::jsonb) into peers
  from public.peer_matches m
  join public.results pr on pr.id = case when m.result_a = res.id then m.result_b else m.result_a end
  join public.applications pa on pa.id = pr.application_id
  where res.id in (m.result_a, m.result_b) and pr.status = 'approved';

  return jsonb_build_object(
    'application', true,
    'first_name', split_part(app.name, ' ', 1),
    'org', app.org,
    'result', jsonb_build_object(
      'outcome', res.outcome,
      'why', res.why_matched,
      'outlet', res.outlet,
      'viewed', res.viewed_at is not null,
      'track', case when coh.id is null then null else jsonb_build_object(
        'name', coh.name, 'company', coh.company, 'goal', coh.goal, 'criteria', coh.criteria,
        'timeline', coh.timeline, 'video_url', coh.video_url, 'slides_url', coh.slides_url,
        'prompts', coh.prompts) end,
      'peers', peers));
end $$;

create function public.portal_mark_viewed() returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.results set viewed_at = now()
  where viewed_at is null and status = 'approved' and season = 'fall-2026'
    and application_id in (select public.portal_my_application_ids());
$$;

-- "I'd be down" on one of my own pairs. Idempotent; returns true once both sides are down.
create function public.portal_peer_down(p_match bigint) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare mine bigint; m record;
begin
  select r.id into mine from public.results r
  where r.status = 'approved' and r.season = 'fall-2026'
    and r.application_id in (select public.portal_my_application_ids());
  if mine is null then raise exception 'no approved result' using errcode = '42501'; end if;
  select * into m from public.peer_matches where id = p_match and mine in (result_a, result_b) for update;
  if m.id is null then raise exception 'not your match' using errcode = '42501'; end if;
  if m.result_a = mine then
    update public.peer_matches set a_down_at = coalesce(a_down_at, now()) where id = m.id returning * into m;
  else
    update public.peer_matches set b_down_at = coalesce(b_down_at, now()) where id = m.id returning * into m;
  end if;
  return m.a_down_at is not null and m.b_down_at is not null;
end $$;

revoke execute on function public.portal_me(), public.portal_mark_viewed(), public.portal_peer_down(bigint)
  from public, anon;
grant execute on function public.portal_me(), public.portal_mark_viewed(), public.portal_peer_down(bigint)
  to authenticated, service_role;
revoke execute on function public.results_seat_cap() from public, anon, authenticated;

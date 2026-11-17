-- Applicant portal schema (venn-site #113, epic #112). Additive: only new tables/functions; applications untouched.
-- Owner of a row = the confirmed auth user whose email maps (public.email_key) to applications.email_key.
-- Writes: service role (drafts) or later security-definer RPCs (#116). Authenticated has SELECT only.

create table public.cohorts (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  company text,
  goal text,
  criteria text,
  timeline text,
  video_url text,
  slides_url text,
  logo_path text,
  season text not null default 'fall-2026'
);

create table public.results (
  id bigint generated always as identity primary key,
  application_id bigint not null references public.applications (id),
  season text not null default 'fall-2026',
  outcome text not null check (outcome in ('cohort', 'peer', 'network_waitlist', 'track_waitlist', 'not_this_season')),
  cohort_id bigint references public.cohorts (id),
  why_matched text,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (application_id, season)
);
create index results_cohort_id on public.results (cohort_id);

create table public.peer_matches (
  id bigint generated always as identity primary key,
  season text not null default 'fall-2026',
  result_a bigint not null references public.results (id),
  result_b bigint not null references public.results (id),
  why_matched text,
  a_down_at timestamptz,
  b_down_at timestamptz,
  check (result_a <> result_b),
  unique (result_a),
  unique (result_b)
);

-- A result may sit on only one side of one pair (the unique indexes cover same-side; this covers cross-side).
create function public.peer_matches_one_pair() returns trigger language plpgsql set search_path = public as $$
begin
  -- Serialize pair writes: under READ COMMITTED, concurrent inserts (x,y) and (z,x) would both pass the
  -- exists check below and commit. The transaction-scoped lock makes the second one see the first.
  perform pg_advisory_xact_lock(hashtext('peer_matches_pair'));
  if exists (
    select 1 from public.peer_matches p
    where p.id is distinct from new.id
      and (p.result_a in (new.result_a, new.result_b) or p.result_b in (new.result_a, new.result_b))
  ) then
    raise exception 'a result can be in at most one peer pair' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger peer_matches_one_pair before insert or update on public.peer_matches
  for each row execute function public.peer_matches_one_pair();

create table public.mou_signatures (
  id bigint generated always as identity primary key,
  result_id bigint not null unique references public.results (id),
  cohort_id bigint not null references public.cohorts (id),
  typed_name text not null,
  agreed boolean not null check (agreed),
  signed_at timestamptz not null default now(),
  user_id uuid not null
);

-- Seam for RLS and #116: application ids owned by the signed-in, email-confirmed auth user.
create function public.portal_my_application_ids() returns setof bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id
  from public.applications a
  where a.email_key = public.email_key(auth.jwt() ->> 'email')
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;
revoke execute on function public.portal_my_application_ids() from public, anon;
grant execute on function public.portal_my_application_ids() to authenticated, service_role;

alter table public.cohorts enable row level security;
alter table public.results enable row level security;
alter table public.peer_matches enable row level security;
alter table public.mou_signatures enable row level security;

revoke all on public.cohorts, public.results, public.peer_matches, public.mou_signatures from public, anon, authenticated;
grant select on public.cohorts, public.results, public.peer_matches, public.mou_signatures to authenticated;
grant all on public.cohorts, public.results, public.peer_matches, public.mou_signatures to service_role;

-- Policies below are SELECT-only on purpose: there is no insert/update/delete path for authenticated.
create policy results_own_approved on public.results for select to authenticated
  using (status = 'approved' and application_id in (select public.portal_my_application_ids()));

create policy cohorts_via_own_result on public.cohorts for select to authenticated
  using (id in (select r.cohort_id from public.results r));  -- results RLS limits this to own approved rows

create policy peer_matches_own_pair on public.peer_matches for select to authenticated
  using (result_a in (select r.id from public.results r) or result_b in (select r.id from public.results r));

create policy mou_own on public.mou_signatures for select to authenticated
  using (result_id in (select r.id from public.results r));

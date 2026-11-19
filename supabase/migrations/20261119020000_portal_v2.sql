-- Applicant portal schema v2 (venn-site #126, epic #112). Additive only: new columns, tables, functions, policies.
-- Owner = confirmed auth user whose email_key matches applications.email_key, or a live team_members row of the lead's result.
-- Reads only where results.status = 'approved'. Writes: service role or security-definer RPCs (#116); authenticated has SELECT only.

alter table public.cohorts add column if not exists seat_cap int not null default 6 check (seat_cap > 0);

alter table public.results
  add column if not exists letter text,
  add column if not exists ceremony_done_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists claim_deadline timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists text_code text,
  add column if not exists phone text,
  add column if not exists whatsapp boolean not null default false;
alter table public.results add constraint results_text_code_shape check (text_code ~ '^VENN-[A-Z0-9]{4}$');
create unique index results_text_code_key on public.results (text_code);

create table public.team_members (
  id bigint generated always as identity primary key,
  lead_result_id bigint not null references public.results (id),
  email_key text not null,
  user_id uuid,
  invited_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index team_members_live_email on public.team_members (lead_result_id, email_key) where removed_at is null;
create index team_members_user on public.team_members (user_id) where removed_at is null;
create index team_members_email on public.team_members (email_key) where removed_at is null;

-- At most 3 live members per lead; per-lead advisory lock so concurrent writes cannot both pass.
create function public.team_members_cap() returns trigger language plpgsql set search_path = public as $$
begin
  new.email_key := public.email_key(new.email_key);
  if new.removed_at is null then
    perform pg_advisory_xact_lock(hashtext('team_members_cap'), new.lead_result_id::int);
    if (select count(*) from public.team_members t
        where t.lead_result_id = new.lead_result_id and t.removed_at is null
          and t.id is distinct from new.id) >= 3 then
      raise exception 'a lead can have at most 3 live team members' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger team_members_cap before insert or update on public.team_members
  for each row execute function public.team_members_cap();

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  clause text not null,
  accepted boolean not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, clause, version)
);

create table public.parent_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  parent_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index parent_consents_user on public.parent_consents (user_id);

create table public.guiding_answers (
  id bigint generated always as identity primary key,
  result_id bigint not null references public.results (id),
  question text not null,
  answer text not null,
  updated_at timestamptz not null default now(),
  unique (result_id, question)
);

-- Single-use 72h links: live = used_at is null and expires_at > now().
create table public.portal_links (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  used_at timestamptz
);
create index portal_links_user on public.portal_links (user_id);

-- Seams for RLS and #116. Live member of a lead's result (by user_id or email), confirmed email.
create function public.portal_is_team_member(lead bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.team_members t
    where t.lead_result_id = lead and t.removed_at is null
      and (t.user_id = auth.uid() or t.email_key = public.email_key(auth.jwt() ->> 'email'))
      and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
  )
$$;

-- True when the caller owns this APPROVED result: its applicant, or a live team member of the lead.
create function public.portal_owns_result(result_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.results r
    where r.id = result_id and r.status = 'approved'
      and (r.application_id in (select public.portal_my_application_ids())
           or public.portal_is_team_member(r.id))
  )
$$;
revoke execute on function public.portal_is_team_member(bigint), public.portal_owns_result(bigint) from public, anon;
grant execute on function public.portal_is_team_member(bigint), public.portal_owns_result(bigint) to authenticated, service_role;

alter table public.team_members enable row level security;
alter table public.consents enable row level security;
alter table public.parent_consents enable row level security;
alter table public.guiding_answers enable row level security;
alter table public.portal_links enable row level security;

revoke all on public.team_members, public.consents, public.parent_consents, public.guiding_answers, public.portal_links
  from public, anon, authenticated;
revoke all on sequence public.team_members_id_seq, public.consents_id_seq, public.parent_consents_id_seq,
  public.guiding_answers_id_seq, public.portal_links_id_seq from public, anon, authenticated;
grant select on public.team_members, public.consents, public.guiding_answers to authenticated;
-- token hashes are never readable by the owner
grant select (id, user_id, parent_email, expires_at, signed_at, created_at) on public.parent_consents to authenticated;
grant select (id, user_id, created_at, expires_at, used_at) on public.portal_links to authenticated;
grant all on public.team_members, public.consents, public.parent_consents, public.guiding_answers, public.portal_links to service_role;
grant all on all sequences in schema public to service_role;

-- Team members read the lead's approved result (v1 policy covers the applicant).
create policy results_team_approved on public.results for select to authenticated
  using (status = 'approved' and public.portal_is_team_member(id));

create policy team_members_own on public.team_members for select to authenticated
  using (public.portal_owns_result(lead_result_id));
create policy guiding_answers_own on public.guiding_answers for select to authenticated
  using (public.portal_owns_result(result_id));
-- Per-user rows: only the user, and only while they own some approved result.
create policy consents_own on public.consents for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.results));
create policy parent_consents_own on public.parent_consents for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.results));
create policy portal_links_own on public.portal_links for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.results));

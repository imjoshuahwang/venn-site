-- venn#1021: locked guides. The locked body lives only in guide_locked; unlock_guide() is the gate (ADR 0004).
-- anon gets no table privileges, only EXECUTE on the two RPCs.
create table if not exists public.guide_locked (
  slug text primary key check (char_length(slug) between 1 and 100),
  html text not null check (char_length(html) <= 500000),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) <= 254),
  thing text not null check (char_length(thing) between 1 and 200),
  ref text not null default '' check (ref ~ '^[a-z0-9_-]{0,40}$'),
  guide_slug text not null check (char_length(guide_slug) between 1 and 100),
  tier text not null default 'member' check (tier in ('member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, guide_slug)
);

create table if not exists public.guide_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('guide_view','form_start','unlock')),
  slug text not null check (char_length(slug) between 1 and 100),
  ref text not null default '' check (ref ~ '^[a-z0-9_-]{0,40}$'),
  at timestamptz not null default now()
);
create index if not exists guide_events_slug_at on public.guide_events (slug, at);

-- One row per unlock call, so the per-email daily cap counts repeats (members keeps one row per email+guide).
create table if not exists public.guide_unlock_log (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) <= 254),
  at timestamptz not null default now()
);
create index if not exists guide_unlock_log_email_at on public.guide_unlock_log (email, at);

alter table public.guide_locked enable row level security;
alter table public.members enable row level security;
alter table public.guide_events enable row level security;
alter table public.guide_unlock_log enable row level security;
revoke all on table public.guide_locked, public.members, public.guide_events, public.guide_unlock_log from public, anon, authenticated;
revoke all on sequence public.members_id_seq, public.guide_events_id_seq, public.guide_unlock_log_id_seq from public, anon, authenticated;

create or replace function public.guide_event(p_event text, p_slug text, p_ref text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event is null or p_event not in ('guide_view','form_start') then
    raise exception 'bad_event' using errcode = '22023';
  end if;
  p_ref := coalesce(p_ref, '');
  if p_ref !~ '^[a-z0-9_-]{0,40}$' then raise exception 'bad_ref' using errcode = '22023'; end if;
  if p_slug is null or not exists (select 1 from guide_locked where slug = p_slug) then
    raise exception 'bad_slug' using errcode = '22023';
  end if;
  if (select count(*) from guide_events where slug = p_slug and at > now() - interval '1 hour') >= 2000 then
    raise exception 'rate_slug' using errcode = 'P0001';
  end if;
  insert into guide_events(event, slug, ref) values (p_event, p_slug, p_ref);
end $$;

create or replace function public.unlock_guide(p_slug text, p_email text, p_thing text, p_ref text default '')
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_thing text := btrim(coalesce(p_thing, ''));
        v_ref text := coalesce(p_ref, ''); v_html text;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email' using errcode = '22023';
  end if;
  if char_length(v_thing) not between 1 and 200 then raise exception 'bad_thing' using errcode = '22023'; end if;
  if v_ref !~ '^[a-z0-9_-]{0,40}$' then raise exception 'bad_ref' using errcode = '22023'; end if;
  select html into v_html from guide_locked where slug = p_slug;
  if v_html is null then raise exception 'bad_slug' using errcode = '22023'; end if;
  if (select count(*) from guide_unlock_log where email = v_email and at > now() - interval '1 day') >= 5 then
    raise exception 'rate_email' using errcode = 'P0001';
  end if;
  insert into guide_unlock_log(email) values (v_email);
  insert into members(email, thing, ref, guide_slug) values (v_email, v_thing, v_ref, p_slug)
    on conflict (email, guide_slug) do update set thing = excluded.thing, ref = excluded.ref, updated_at = now();
  insert into guide_events(event, slug, ref) values ('unlock', p_slug, v_ref);
  return v_html;
end $$;

revoke execute on function public.guide_event(text, text, text) from public;
revoke execute on function public.unlock_guide(text, text, text, text) from public;
grant execute on function public.guide_event(text, text, text) to anon;
grant execute on function public.unlock_guide(text, text, text, text) to anon;

-- Under-18 MOU step (#224). Signatures live in a table, not a storage bucket (the local test db has no storage schema).
-- No table grants: every read and write goes through the SECURITY DEFINER functions below, keyed on auth.uid().
create table public.minor_mou (
  user_id uuid primary key,
  minor_sig bytea,
  minor_signed_at timestamptz,
  parent_name text,
  parent_sig bytea,
  parent_signed_at timestamptz,
  confirmed_at timestamptz
);
alter table public.minor_mou enable row level security;
revoke all on public.minor_mou from public, anon, authenticated;

-- Same as 20261124010000 plus: the parent's email may not be the student's own (email_key compares past +tags).
create or replace function public.request_parent_consent(p_user_id uuid, p_parent_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := p_user_id;
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.applications a join auth.users u on a.email_key = public.email_key(u.email)
                 where u.id = uid and u.email_confirmed_at is not null and a.level = 'high_school') then
    raise exception 'not a minor' using errcode = '42501';
  end if;
  if p_parent_email is null or p_parent_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if public.email_key(p_parent_email) = (select public.email_key(email) from auth.users where id = uid) then
    raise exception 'parent email is the student''s own' using errcode = '22023';
  end if;
  if exists (select 1 from public.parent_consents where user_id = uid and signed_at is not null) then
    raise exception 'already signed' using errcode = '23505';
  end if;
  update public.parent_consents set expires_at = now() where user_id = uid and signed_at is null and expires_at > now();
  insert into public.parent_consents (user_id, parent_email, token_hash, expires_at)
  values (uid, lower(btrim(p_parent_email)), encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '72 hours');
  return tok;
end $$;

create function public.minor_mou_is_minor(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications a join auth.users u on a.email_key = public.email_key(u.email)
                 where u.id = uid and u.email_confirmed_at is not null and a.level = 'high_school')
$$;
revoke all on function public.minor_mou_is_minor(uuid) from public, anon, authenticated;

-- One jsonb for the page: minor flag and each step's state. Never returns signature bytes.
create function public.minor_mou_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m public.minor_mou; pc boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into m from public.minor_mou where user_id = uid;
  select exists (select 1 from public.parent_consents where user_id = uid and signed_at is not null) into pc;
  return jsonb_build_object(
    'minor', public.minor_mou_is_minor(uid),
    'minor_signed', m.minor_sig is not null,
    'parent_name', m.parent_name,
    'parent_signed', m.parent_sig is not null,
    'parent_link_signed', pc,
    'confirmed', m.confirmed_at is not null);
end $$;

-- p_role 'minor' or 'parent'; p_png is a base64 PNG. Minor signs first, minors only.
create function public.minor_mou_sign(p_role text, p_png text, p_parent_name text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); raw bytea; m public.minor_mou;
begin
  if uid is null or not public.minor_mou_is_minor(uid) then raise exception 'not a minor' using errcode = '42501'; end if;
  if p_role not in ('minor', 'parent') then raise exception 'bad role' using errcode = '22023'; end if;
  begin raw := decode(p_png, 'base64'); exception when others then raise exception 'bad signature' using errcode = '22023'; end;
  if raw is null or length(raw) > 200000 or length(raw) < 100 or substring(raw from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'bad signature' using errcode = '22023';
  end if;
  select * into m from public.minor_mou where user_id = uid;
  if m.confirmed_at is not null then raise exception 'already confirmed' using errcode = '23505'; end if;
  if p_role = 'minor' then
    insert into public.minor_mou (user_id, minor_sig, minor_signed_at) values (uid, raw, now())
    on conflict (user_id) do update set minor_sig = excluded.minor_sig, minor_signed_at = excluded.minor_signed_at;
  else
    if m.minor_sig is null then raise exception 'minor signs first' using errcode = '55000'; end if;
    if p_parent_name is null or length(btrim(p_parent_name)) < 2 or length(p_parent_name) > 120 then raise exception 'parent name needed' using errcode = '22023'; end if;
    update public.minor_mou set parent_sig = raw, parent_name = btrim(p_parent_name), parent_signed_at = now() where user_id = uid;
  end if;
end $$;

-- Needs the minor's signature and either an on-page parent signature or a parent who signed through the emailed link.
create function public.minor_mou_confirm() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m public.minor_mou; pc boolean;
begin
  if uid is null or not public.minor_mou_is_minor(uid) then raise exception 'not a minor' using errcode = '42501'; end if;
  select * into m from public.minor_mou where user_id = uid;
  select exists (select 1 from public.parent_consents where user_id = uid and signed_at is not null) into pc;
  if m.minor_sig is null or not (m.parent_sig is not null or pc) then raise exception 'signatures missing' using errcode = '55000'; end if;
  update public.minor_mou set confirmed_at = coalesce(confirmed_at, now()) where user_id = uid;
end $$;

revoke all on function public.minor_mou_state(), public.minor_mou_sign(text, text, text), public.minor_mou_confirm() from public, anon;
grant execute on function public.minor_mou_state(), public.minor_mou_sign(text, text, text), public.minor_mou_confirm() to authenticated;

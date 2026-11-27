-- Student onboarding (venn-site #223). Additive: columns on applications, three security-definer RPCs for the signed-in student's own row.
-- Birthday, location and phone are written only through these RPCs; authenticated has no UPDATE on applications.
alter table public.applications
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists full_name text check (length(full_name) <= 200),
  add column if not exists location text check (length(location) <= 200),
  add column if not exists birthday date,
  add column if not exists org_confirmed boolean,
  add column if not exists org_correction text check (length(org_correction) <= 300),
  add column if not exists phone text,
  add column if not exists whatsapp_opt_in boolean,
  add column if not exists onboarding_profile_at timestamptz,
  add column if not exists onboarding_consent_at timestamptz;

-- Age is counted on the day of signing in Los Angeles; the app route and this function agree.
create function public.onboarding_today() returns date language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'America/Los_Angeles')::date;
$$;

create function public.get_onboarding() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object(
      'required', a.onboarding_started_at is not null and (a.onboarding_consent_at is null
        or (a.birthday > (public.onboarding_today() - interval '18 years')::date and not exists (select 1 from public.mou_signatures m where m.user_id = auth.uid()))),
      'started', a.onboarding_started_at is not null,
      'profile_done', a.onboarding_profile_at is not null,
      'contact_done', a.onboarding_consent_at is not null,
      'minor', a.birthday is not null and a.birthday > (public.onboarding_today() - interval '18 years')::date,
      'mou_done', exists (select 1 from public.mou_signatures m where m.user_id = auth.uid()),
      'name', coalesce(a.full_name, a.name),
      'org', coalesce(a.org, '')
    ) from public.applications a where a.id in (select public.portal_my_application_ids()) order by a.id limit 1
  ), jsonb_build_object('required', false));
$$;

-- Called when the student sets a password from the invite or recovery link; idempotent.
create function public.start_onboarding() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.applications set onboarding_started_at = coalesce(onboarding_started_at, now())
  where id in (select public.portal_my_application_ids());
$$;

create function public.save_onboarding_profile(p_name text, p_location text, p_birthday date) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_location, '')) = '' or p_birthday is null then
    raise exception 'name, location and a valid birthday are required' using errcode = '22023';
  end if;
  -- Real past date with an age of 12 to 25 on the day of saving.
  if p_birthday > public.onboarding_today() or p_birthday > (public.onboarding_today() - interval '12 years')::date
     or p_birthday <= (public.onboarding_today() - interval '26 years')::date then
    raise exception 'birthday must be a past date for an age of 12 to 25' using errcode = '22023';
  end if;
  -- Editable until the MOU is signed; the saved route does not change afterwards.
  if exists (select 1 from public.mou_signatures m where m.user_id = auth.uid()) then
    raise exception 'profile is locked once the MOU is signed' using errcode = '42501';
  end if;
  update public.applications set full_name = btrim(p_name), location = btrim(p_location), birthday = p_birthday,
    onboarding_profile_at = coalesce(onboarding_profile_at, now()), onboarding_started_at = coalesce(onboarding_started_at, now())
  where id in (select public.portal_my_application_ids());
  if not found then raise exception 'application not found' using errcode = '42501'; end if;
  return case when p_birthday <= (public.onboarding_today() - interval '18 years')::date then 'adult' else 'minor' end;
end $$;

create function public.save_onboarding_contact(p_org_ok boolean, p_org_correction text, p_phone text, p_whatsapp boolean, p_consent boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone must be in international format' using errcode = '22023'; end if;
  if p_org_ok is null or p_whatsapp is null or p_consent is not true then raise exception 'org, whatsapp and consent are required' using errcode = '22023'; end if;
  if p_org_ok = false and btrim(coalesce(p_org_correction, '')) = '' then raise exception 'org correction required' using errcode = '22023'; end if;
  update public.applications set org_confirmed = p_org_ok, org_correction = case when p_org_ok then null else btrim(p_org_correction) end,
    phone = v_phone, whatsapp_opt_in = p_whatsapp, onboarding_consent_at = coalesce(onboarding_consent_at, now())
  where id in (select public.portal_my_application_ids()) and onboarding_profile_at is not null;
  if not found then raise exception 'profile step not done' using errcode = '42501'; end if;
end $$;

revoke execute on function public.onboarding_today(), public.get_onboarding(), public.start_onboarding(), public.save_onboarding_profile(text, text, date),
  public.save_onboarding_contact(boolean, text, text, boolean, boolean) from public, anon;
grant execute on function public.onboarding_today(), public.get_onboarding(), public.start_onboarding(), public.save_onboarding_profile(text, text, date),
  public.save_onboarding_contact(boolean, text, text, boolean, boolean) to authenticated;

-- Parent co-sign (venn-site #128). Minor = application level high_school (ADR 0004).
-- request_parent_consent: service_role only (the portal server passes the session's user id), so the raw token never reaches the applicant's browser.
-- It stores only the sha256 of a 72h single-use token and returns the raw token to the server, which mails it.
-- A resend expires any unsigned token first, so the old link dies. parent_consent_state / sign_parent_consent take the raw token from the emailed link (anon).
create function public.request_parent_consent(p_user_id uuid, p_parent_email text) returns text
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
  if exists (select 1 from public.parent_consents where user_id = uid and signed_at is not null) then
    raise exception 'already signed' using errcode = '23505';
  end if;
  update public.parent_consents set expires_at = now() where user_id = uid and signed_at is null and expires_at > now();
  insert into public.parent_consents (user_id, parent_email, token_hash, expires_at)
  values (uid, lower(btrim(p_parent_email)), encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '72 hours');
  return tok;
end $$;

-- 'ok' = can sign, 'used' = already signed, 'expired', 'unknown'.
create function public.parent_consent_state(p_token text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case when signed_at is not null then 'used' when expires_at <= now() then 'expired' else 'ok' end
    from public.parent_consents where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')), 'unknown')
$$;

create function public.sign_parent_consent(p_token text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s text := public.parent_consent_state(p_token);
begin
  if s = 'ok' then
    update public.parent_consents set signed_at = now() where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex');
    return 'signed';
  end if;
  return s;
end $$;

revoke all on function public.request_parent_consent(uuid, text) from public, anon, authenticated;
grant execute on function public.request_parent_consent(uuid, text) to service_role;
revoke all on function public.parent_consent_state(text), public.sign_parent_consent(text) from public;
grant execute on function public.parent_consent_state(text), public.sign_parent_consent(text) to anon, authenticated;

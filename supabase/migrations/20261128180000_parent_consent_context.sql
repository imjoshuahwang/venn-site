-- Parent page context (#284): the child's first name and cohort name for a valid, unsigned or signed token. Nothing else about the child (#239).
-- parent_consent_state keeps returning text; sign_parent_consent still calls it. Empty for an unknown or expired unsigned token.
create function public.parent_consent_context(p_token text) returns table (first_name text, cohort_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select split_part(btrim(a.name), ' ', 1), c.name
  from public.parent_consents pc
  join auth.users u on u.id = pc.user_id
  join public.applications a on a.email_key = public.email_key(u.email)
  join public.results r on r.application_id = a.id
  join public.cohorts c on c.id = r.cohort_id
  where pc.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and (pc.signed_at is not null or pc.expires_at > now())
  order by r.created_at desc
  limit 1
$$;

revoke all on function public.parent_consent_context(text) from public;
grant execute on function public.parent_consent_context(text) to anon, authenticated;

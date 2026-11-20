-- Share card (#173): the caller's own first name only, from their application (first word, no last name).
create function public.get_my_first_name() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select split_part(btrim(a.name), ' ', 1) from public.applications a
  where a.id in (select public.portal_my_application_ids()) order by a.id limit 1
$$;
revoke execute on function public.get_my_first_name() from public, anon;
grant execute on function public.get_my_first_name() to authenticated, service_role;

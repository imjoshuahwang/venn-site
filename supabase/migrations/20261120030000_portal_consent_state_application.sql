-- consent_state gains `application` (venn-site #127): false when the signed-in user has no application, so the page can say so instead of showing the form.
create or replace function public.consent_state(p_version text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'done', (select count(*) = 5 from public.consents where user_id = auth.uid() and version = p_version),
    'application', exists (select 1 from public.applications a where a.id in (select public.portal_my_application_ids())),
    'minor', exists (select 1 from public.applications a where a.id in (select public.portal_my_application_ids()) and a.level = 'high_school'),
    'answers', coalesce((select jsonb_object_agg(clause, accepted) from public.consents where user_id = auth.uid() and version = p_version), '{}'::jsonb)
  )
$$;

-- give_consent (venn-site #127): the only write path into public.consents (table stays select-only under RLS).
-- clauses = {"<key>": true|false, ...}. Required keys must be present and true; optional keys default to false.
-- One row per clause for auth.uid(); re-calling with the same version updates the answers (idempotent).
create function public.give_consent(clauses jsonb, version text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  required_keys text[] := array['coordinator_groups', 'data_use', 'retention'];
  known_keys text[] := array['coordinator_groups', 'highlights', 'full_name_photo', 'data_use', 'retention'];
  k text;
  v jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if version is null or btrim(version) = '' then raise exception 'version required' using errcode = '22023'; end if;
  if clauses is null or jsonb_typeof(clauses) <> 'object' then raise exception 'clauses must be an object' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(clauses) loop
    if not (k = any (known_keys)) then raise exception 'unknown clause %', k using errcode = '22023'; end if;
    if jsonb_typeof(v) <> 'boolean' then raise exception 'clause % must be true or false', k using errcode = '22023'; end if;
  end loop;
  foreach k in array required_keys loop
    if coalesce(clauses -> k, 'false'::jsonb) <> 'true'::jsonb then
      raise exception 'required clause % not accepted', k using errcode = '22023';
    end if;
  end loop;
  foreach k in array known_keys loop
    insert into public.consents (user_id, clause, accepted, version)
    values (uid, k, coalesce((clauses ->> k)::boolean, false), version)
    on conflict on constraint consents_user_id_clause_version_key do update set accepted = excluded.accepted, accepted_at = now();
  end loop;
  return array_length(known_keys, 1);
end $$;

revoke all on function public.give_consent(jsonb, text) from public, anon;
grant execute on function public.give_consent(jsonb, text) to authenticated;

-- venn#358: 20261019050000_security.sql revoked default privileges for tables and sequences only, so any
-- future function in public was EXECUTE-able by PUBLIC/anon/authenticated. Close that too.
-- From now on every new anon RPC needs an explicit `grant execute on function ... to anon`.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- Supabase also sets defaults FOR ROLE supabase_admin; cover it where that role exists (absent in the local stub).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated;
  end if;
end $$;

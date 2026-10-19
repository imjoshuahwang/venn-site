-- venn#358: 20261019050000_security.sql revoked default privileges for tables and sequences only, so any
-- future function in public was EXECUTE-able by PUBLIC/anon/authenticated. Close that too.
-- From now on every new anon RPC needs an explicit `grant execute on function ... to anon`.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;
-- Functions created by supabase_admin are out of scope (postgres cannot alter that role's defaults on hosted Supabase).

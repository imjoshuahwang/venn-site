#!/usr/bin/env bash
# Runs every supabase/tests/*_check.sql against a throwaway LOCAL Postgres (no Docker, no network).
#   bash supabase/tests/run_local.sh      (from the repo root; needs Postgres binaries, e.g. Homebrew)
# Stubs what Supabase provides: roles, net.http_post (NO-OP, never touches the network), vault.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /opt/homebrew/bin/initdb)")}"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/venn-sql.XXXXXX")"
port=$((20000 + RANDOM % 20000))
cleanup() { "$PGBIN/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$tmp/data" -U postgres -A trust --no-sync >/dev/null
"$PGBIN/pg_ctl" -D "$tmp/data" -w -l "$tmp/pg.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p $port -c fsync=off" start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
psql_() { "$PGBIN/psql" -X -q -h "$tmp" -p "$port" -U postgres -v ON_ERROR_STOP=1 "$@"; }

psql_ -d postgres -c 'create database t' >/dev/null
psql_ -d t >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema net; create schema vault; create schema auth;
-- Auth stubs mirroring Supabase: uid()/jwt() read request.jwt.claims; minimal auth.users.
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create function auth.uid() returns uuid language sql stable as
  $f$ select nullif(auth.jwt()->>'sub', '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
-- NO-OP: pg_net is not installed; this never makes a network call.
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{"Content-Type":"application/json"}', timeout_milliseconds int default 5000)
  returns bigint language sql as 'select 0::bigint';
create table vault.secrets (id uuid default gen_random_uuid(), name text, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text default null, d text default '') returns uuid
  language sql as 'insert into vault.secrets(name, secret) values (n, s) returning id';
SQL

for f in "$root"/supabase/migrations/*.sql; do
  sed '/^[[:space:]]*create extension if not exists pg_net/d' "$f" | psql_ -d t >/dev/null \
    || { echo "FAIL migration $(basename "$f")" >&2; exit 1; }
done

for f in "$root"/supabase/tests/*_check.sql; do
  psql_ -d t -f "$f" >/dev/null || { echo "FAIL $(basename "$f")" >&2; exit 1; }
  echo "ok $(basename "$f")"
done

# Concurrency: a result may sit in at most 2 Peer pairs. It already has one; two overlapping inserts would each
# see a count of 1 without the advisory lock in the trigger. Exactly one of them must fail.
psql_ -d t >/dev/null <<'SQL'
insert into public.applications (role, name, email, working_on, source)
  select 'student', 'race' || g, 'race' || g || '@example.com', 'x', '/apply' from generate_series(1, 4) g;
insert into public.results (application_id, outcome, status)
  select id, 'peer', 'approved' from public.applications where email like 'race%@example.com';
SQL
ids=($(psql_ -d t -At -c "select r.id from public.results r join public.applications a on a.id = r.application_id where a.email like 'race%' order by r.id"))
psql_ -d t -c "insert into public.peer_matches(result_a, result_b) values (${ids[0]}, ${ids[3]});" >/dev/null
( psql_ -d t -c "begin; insert into public.peer_matches(result_a, result_b) values (${ids[0]}, ${ids[1]}); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 1
rc=0; psql_ -d t -c "insert into public.peer_matches(result_a, result_b) values (${ids[2]}, ${ids[0]});" >/dev/null 2>&1 || rc=$?
wait
pairs=$(psql_ -d t -At -c "select count(*) from public.peer_matches where result_a = ${ids[0]} or result_b = ${ids[0]}")
[ "$rc" -ne 0 ] && [ "$pairs" = 2 ] || { echo "FAIL concurrent peer pair race (rc=$rc pairs=$pairs)" >&2; exit 1; }
echo "ok concurrent peer pair race"

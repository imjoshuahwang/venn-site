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
create schema extensions; create schema net; create schema vault;
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

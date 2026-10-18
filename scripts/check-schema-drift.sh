#!/usr/bin/env bash
# Builds a throwaway database from supabase/migrations/*.sql, dumps its public schema and
# diffs it against supabase/schema-snapshot.sql. Fails on drift.
#
#   scripts/check-schema-drift.sh            check
#   scripts/check-schema-drift.sh --update   regenerate the snapshot after adding a migration
#
# Needs psql + pg_dump on PATH and a reachable Postgres (standard PG* env vars, e.g.
# PGHOST/PGPORT/PGUSER/PGPASSWORD). Use the same major version as the live database.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
snapshot="$root/supabase/schema-snapshot.sql"
db="schema_drift_$$"

psql -qX -d postgres -c "create database $db"
trap 'psql -qX -d postgres -c "drop database if exists $db" >/dev/null' EXIT

for f in "$root"/supabase/migrations/*.sql; do
  psql -qX -v ON_ERROR_STOP=1 -d "$db" -f "$f"
done

# \restrict tokens and version comments change on every dump; cat -s squeezes the blank lines
# their removal leaves behind, which differ between 17.x minor versions
dump="$(pg_dump -d "$db" --schema-only --schema=public --no-owner --no-privileges \
  --quote-all-identifiers | grep -vE '^(\\(un)?restrict |-- Dumped )' | cat -s)"

if [ "${1:-}" = "--update" ]; then
  printf '%s\n' "$dump" > "$snapshot"
  echo "Updated $snapshot"
  exit 0
fi

if ! diff -u "$snapshot" <(printf '%s\n' "$dump"); then
  echo "Schema drift: migrations do not match supabase/schema-snapshot.sql." >&2
  echo "If the change is intended, run scripts/check-schema-drift.sh --update and commit it." >&2
  exit 1
fi
echo "No schema drift."

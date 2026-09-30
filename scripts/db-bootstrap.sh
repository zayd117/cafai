#!/usr/bin/env bash
# DEV/TEST ONLY: creates local roles and databases.
# Managed Postgres (plan §17) provisions roles its own way; migrations only assume the role names below exist.
#   cafai_owner   owns schema objects, runs migrations (never used by the app at runtime)
#   cafai_app     runtime role for the web app and worker; subject to row-level security
#   cafai_catalog catalog pipeline; the only role that may write catalog tables (plan §19)
# Superuser access: $PSQL_SUPERUSER_URL if set (CI service container), else the local postgres OS user.
set -euo pipefail
PW="${CAFAI_DEV_DB_PASSWORD:-cafai_dev_only}"

su_psql() { # su_psql <db> <sql>
  if [[ -n "${PSQL_SUPERUSER_URL:-}" ]]; then
    psql "${PSQL_SUPERUSER_URL%/*}/$1" -v ON_ERROR_STOP=1 -qtAc "$2"
  else
    su postgres -c "psql -d '$1' -v ON_ERROR_STOP=1 -qtAc \"$2\""
  fi
}

for role in cafai_owner cafai_app cafai_catalog; do
  if [[ -z "$(su_psql postgres "SELECT 1 FROM pg_roles WHERE rolname='$role'")" ]]; then
    su_psql postgres "CREATE ROLE $role LOGIN PASSWORD '$PW'"
  fi
done
for db in cafai_dev cafai_test; do
  if [[ -z "$(su_psql postgres "SELECT 1 FROM pg_database WHERE datname='$db'")" ]]; then
    su_psql postgres "CREATE DATABASE $db OWNER cafai_owner"
  fi
  su_psql "$db" "ALTER SCHEMA public OWNER TO cafai_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO cafai_app, cafai_catalog"
done
echo "bootstrap ok: roles cafai_owner/cafai_app/cafai_catalog, databases cafai_dev/cafai_test"

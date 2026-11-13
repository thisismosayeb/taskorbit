#!/usr/bin/env bash
# TaskOrbit CI — seed the E2E test accounts + workspace on LOCAL Supabase.
#
# Creates, via the local Auth Admin API (local service-role key only):
#   ci-manager@taskorbit-ci.local   (manager)
#   ci-developer@taskorbit-ci.local (developer)
# plus an empty workspace named "Test Workspace" they both belong to
# (the name tests/e2e/global-setup.ts looks for first).
#
# Run ONLY in CI against `supabase start` (or a disposable local stack),
# AFTER the RLS tests: the RLS script's cleanup deletes @testorbit.local
# users, and these accounts use @taskorbit-ci.local so the two never
# collide even if the order changes. Passwords are generated fresh per
# run and exported via $GITHUB_ENV (never printed, never committed).
#
# Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
# SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL. All are local defaults
# captured from `supabase status` by the CI workflow — never a real key.
set -euo pipefail

API_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
DB_URL="${SUPABASE_DB_URL:-}"

[ -n "$API_URL" ] || { echo "ci-seed: SUPABASE_URL is not set" >&2; exit 1; }
[ -n "$SERVICE_KEY" ] || { echo "ci-seed: SUPABASE_SERVICE_ROLE_KEY is not set" >&2; exit 1; }
[ -n "$DB_URL" ] || { echo "ci-seed: SUPABASE_DB_URL is not set" >&2; exit 1; }

MANAGER_EMAIL="ci-manager@taskorbit-ci.local"
DEVELOPER_EMAIL="ci-developer@taskorbit-ci.local"
MANAGER_PASSWORD="$(openssl rand -hex 16)"
DEVELOPER_PASSWORD="$(openssl rand -hex 16)"

# Create one auth user via the Admin API; prints the new user id.
# email_confirm=true so the account can sign in immediately (local
# Supabase sends no real email).
create_user() {
  local email="$1" password="$2" full_name="$3"
  local tmp code
  tmp="$(mktemp)"
  code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "${API_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg email "$email" --arg password "$password" --arg name "$full_name" \
        '{email: $email, password: $password, email_confirm: true, user_metadata: {full_name: $name}}')")"
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "ci-seed: failed to create user ${email}: HTTP ${code}" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    return 1
  fi
  jq -r '.id' "$tmp"
  rm -f "$tmp"
}

echo "ci-seed: creating manager account (${MANAGER_EMAIL})"
MANAGER_ID="$(create_user "$MANAGER_EMAIL" "$MANAGER_PASSWORD" "CI Manager")"
echo "ci-seed: creating developer account (${DEVELOPER_EMAIL})"
DEVELOPER_ID="$(create_user "$DEVELOPER_EMAIL" "$DEVELOPER_PASSWORD" "CI Developer")"

# Empty workspace + memberships (direct SQL as local postgres; the
# create_workspace RPC would do the same, this avoids a second sign-in).
psql -X -v ON_ERROR_STOP=1 "$DB_URL" \
  -v mgr="$MANAGER_ID" -v dev="$DEVELOPER_ID" <<'SQL'
insert into public.workspaces (name, slug, timezone, created_by)
values ('Test Workspace', 'test-workspace-ci', 'Asia/Dhaka', :'mgr'::uuid)
on conflict (slug) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, :'mgr'::uuid, 'manager'
from public.workspaces w where w.slug = 'test-workspace-ci'
on conflict (workspace_id, user_id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, :'dev'::uuid, 'developer'
from public.workspaces w where w.slug = 'test-workspace-ci'
on conflict (workspace_id, user_id) do nothing;
SQL

# Export the credentials for the Playwright step (passwords are per-run
# random values for a throwaway local container; never echo them).
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "TEST_MANAGER_EMAIL=${MANAGER_EMAIL}"
    echo "TEST_MANAGER_PASSWORD=${MANAGER_PASSWORD}"
    echo "TEST_DEVELOPER_EMAIL=${DEVELOPER_EMAIL}"
    echo "TEST_DEVELOPER_PASSWORD=${DEVELOPER_PASSWORD}"
  } >> "$GITHUB_ENV"
fi

echo "ci-seed: done — manager ${MANAGER_EMAIL} + developer ${DEVELOPER_EMAIL} in workspace 'Test Workspace'."

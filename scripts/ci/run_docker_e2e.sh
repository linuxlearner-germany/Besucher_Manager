#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT_DIR}/scripts/ops/docker_safety.sh"

ENV_FILE="$(mktemp "${ROOT_DIR}/.env.ci.XXXXXX")"
chmod 600 "${ENV_FILE}"
export BESUCHER_MANAGER_ENV_FILE="${ENV_FILE}"
export BESUCHER_MANAGER_TEST_STACK=1
E2E_PROJECT_NAME="${E2E_PROJECT_NAME:-besucher_manager_e2e_$(date +%Y%m%d%H%M%S)_$$}"
export COMPOSE_PROJECT_NAME="${E2E_PROJECT_NAME}"
BASE_URL_OVERRIDE="${BASE_URL:-}"

cleanup() {
  cd "${ROOT_DIR}"
  if [[ -f "${ENV_FILE}" ]]; then
    if guard_isolated_compose_cleanup "${E2E_PROJECT_NAME}" "${ENV_FILE}"; then
      docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db down -v --remove-orphans
      rm -f "${ENV_FILE}"
    else
      echo "E2E cleanup was blocked. Inspect isolated resources for project ${E2E_PROJECT_NAME}; environment file retained at ${ENV_FILE}." >&2
    fi
  fi
}

trap cleanup EXIT

cat >"${ENV_FILE}" <<'EOF'
NODE_ENV=production
BESUCHER_MANAGER_TEST_STACK=1
APP_HOST=0.0.0.0
PORT=3030
HOST_PORT=0
PUBLIC_BASE_URL=http://127.0.0.1
MSSQL_HOST=sqlserver
MSSQL_PORT=1433
SQLSERVER_HOST_PORT=0
MSSQL_DATABASE=Besuchermngmt
MSSQL_USER=dockerBesuchermngmt
MSSQL_PASSWORD=CiPassword_123!
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123!
APP_SECRET=ci-app-secret-1234567890
APP_SECURE_COOKIES=false
UPLOAD_DIR=/app/uploads
AUDIT_REVERSE_DNS_ENABLED=false
AUDIT_TRUST_REMOTE_USER_HEADER=false
AUDIT_REMOTE_USER_HEADER=x-auth-user
EOF

require_isolated_compose_project "${E2E_PROJECT_NAME}" "${ENV_FILE}"

cd "${ROOT_DIR}"
docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db up -d --build

if [[ -n "${BASE_URL_OVERRIDE}" ]]; then
  BASE_URL="${BASE_URL_OVERRIDE}"
else
  published_address="$(docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" port app 3030)"
  published_port="${published_address##*:}"
  [[ "${published_port}" =~ ^[0-9]+$ ]] || docker_safety_fail "Could not determine the isolated App port."
  BASE_URL="http://127.0.0.1:${published_port}"
fi

for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "${BASE_URL}/health" >/dev/null

docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db exec -T app npm run seed:sample:compiled --workspace @besucher-manager/backend
docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db exec -T app npm run verify:public-confirmation:compiled --workspace @besucher-manager/backend

python3 scripts/ops/verify_role_access.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password Admin123!

python3 scripts/ops/verify_mvp_flow.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password Admin123!

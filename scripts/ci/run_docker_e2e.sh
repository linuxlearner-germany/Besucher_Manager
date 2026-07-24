#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.ci"
DEFAULT_ENV_FILE="${ROOT_DIR}/.env"
BASE_URL="${BASE_URL:-http://127.0.0.1:3030}"
CREATED_DEFAULT_ENV=0

cleanup() {
  cd "${ROOT_DIR}"
  docker compose --env-file "${ENV_FILE}" --profile local-db down -v >/dev/null 2>&1 || true
  rm -f "${ENV_FILE}"
  if [[ "${CREATED_DEFAULT_ENV}" -eq 1 ]]; then
    rm -f "${DEFAULT_ENV_FILE}"
  fi
}

trap cleanup EXIT

cat >"${ENV_FILE}" <<'EOF'
NODE_ENV=production
APP_HOST=0.0.0.0
PORT=3030
PUBLIC_BASE_URL=http://127.0.0.1:3030
MSSQL_HOST=sqlserver
MSSQL_PORT=1433
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

if [[ ! -f "${DEFAULT_ENV_FILE}" ]]; then
  cp "${ENV_FILE}" "${DEFAULT_ENV_FILE}"
  CREATED_DEFAULT_ENV=1
fi

cd "${ROOT_DIR}"
docker compose --env-file "${ENV_FILE}" --profile local-db up -d --build

for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "${BASE_URL}/health" >/dev/null

docker compose --env-file "${ENV_FILE}" --profile local-db exec -T app npm run seed:sample:compiled --workspace @besucher-manager/backend

python3 scripts/ops/verify_role_access.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password Admin123!

python3 scripts/ops/verify_mvp_flow.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password Admin123!

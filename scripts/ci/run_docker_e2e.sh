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
MAILPIT_HOST_PORT=0
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

docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db exec -T app node - <<'NODE'
const sql = require("mssql");
(async () => {
  const pool = await sql.connect({
    server: process.env.MSSQL_HOST,
    port: Number(process.env.MSSQL_PORT || 1433),
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  });
  const values = {
    mail_relay_enabled: "true",
    mail_relay_host: "mailpit",
    mail_relay_port: "1025",
    mail_relay_secure: "false",
    mail_relay_username: "",
    mail_relay_password: "",
    mail_relay_from: "besucher-manager-e2e@example.test"
  };
  for (const [key, value] of Object.entries(values)) {
    await pool.request().input("key", sql.NVarChar(120), key).input("value", sql.NVarChar(sql.MAX), value).query(`
      IF EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key]=@key)
        UPDATE dbo.system_settings SET [value]=@value, updated_at=SYSUTCDATETIME() WHERE [key]=@key;
      ELSE
        INSERT INTO dbo.system_settings([key],[value]) VALUES(@key,@value);`);
  }
  await pool.close();
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE

python3 scripts/ops/verify_admin_bootstrap_persistence.py \
  --base-url "${BASE_URL}" \
  --username admin \
  --initial-password Admin123! \
  --changed-password RebuildAdmin_123! \
  --change

docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db restart app
docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db run --rm db-bootstrap
docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db build app
docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" --profile local-db up -d --force-recreate app

if [[ -z "${BASE_URL_OVERRIDE}" ]]; then
  published_address="$(docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" port app 3030)"
  published_port="${published_address##*:}"
  [[ "${published_port}" =~ ^[0-9]+$ ]] || docker_safety_fail "Could not determine the isolated App port after rebuild."
  BASE_URL="http://127.0.0.1:${published_port}"
fi

for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "${BASE_URL}/health" >/dev/null
python3 scripts/ops/verify_admin_bootstrap_persistence.py \
  --base-url "${BASE_URL}" \
  --username admin \
  --initial-password Admin123! \
  --changed-password RebuildAdmin_123!

python3 scripts/ops/verify_role_access.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password RebuildAdmin_123!

python3 scripts/ops/verify_mvp_flow.py \
  --base-url "${BASE_URL}" \
  --admin-user admin \
  --admin-password RebuildAdmin_123!

mailpit_address="$(docker compose --env-file "${ENV_FILE}" --project-name "${E2E_PROJECT_NAME}" port mailpit 8025)"
mailpit_port="${mailpit_address##*:}"
[[ "${mailpit_port}" =~ ^[0-9]+$ ]] || docker_safety_fail "Could not determine the isolated Mailpit port."
python3 scripts/ops/verify_public_xlsx_application.py --base-url "${BASE_URL}" --mailpit-url "http://127.0.0.1:${mailpit_port}"

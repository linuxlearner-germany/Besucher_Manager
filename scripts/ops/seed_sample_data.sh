#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  set -a
  source ./.env
  set +a
fi

if [[ "${MSSQL_HOST:-}" == "sqlserver" ]]; then
  export MSSQL_HOST="${MSSQL_HOST_LOCAL_OVERRIDE:-127.0.0.1}"
fi

if [[ -d node_modules && -f apps/backend/src/scripts/seedSampleData.ts ]]; then
  npm run seed:sample --workspace @besucher-manager/backend
  exit 0
fi

if docker compose ps -q app >/dev/null 2>&1; then
  app_container_id="$(docker compose ps -q app)"
  if [[ -n "${app_container_id}" ]]; then
    docker compose exec -T app npm run seed:sample:compiled --workspace @besucher-manager/backend
    exit 0
  fi
fi

echo "Kein lokaler Workspace und kein laufender App-Container fuer Seed gefunden." >&2
exit 1

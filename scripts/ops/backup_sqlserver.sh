#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/archive/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ENV file not found: ${ENV_FILE}" >&2
  exit 1
fi

db_name="$(grep '^MSSQL_DATABASE=' "${ENV_FILE}" | cut -d= -f2-)"
db_password="$(grep '^MSSQL_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"

if [[ -z "${db_name}" || -z "${db_password}" ]]; then
  echo "MSSQL_DATABASE or MSSQL_PASSWORD missing in ${ENV_FILE}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

container_id="$(docker compose ps -q sqlserver)"
if [[ -z "${container_id}" ]]; then
  echo "sqlserver container is not running" >&2
  exit 1
fi

backup_name="${db_name}_${TIMESTAMP}.bak"
container_backup_dir="/var/opt/mssql/backup"
container_backup_path="${container_backup_dir}/${backup_name}"
local_backup_path="${BACKUP_DIR}/${backup_name}"

docker exec "${container_id}" mkdir -p "${container_backup_dir}"
docker exec "${container_id}" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P "${db_password}" \
  -C \
  -Q "BACKUP DATABASE [${db_name}] TO DISK = N'${container_backup_path}' WITH INIT, COPY_ONLY;"

docker cp "${container_id}:${container_backup_path}" "${local_backup_path}"

echo "Backup written to ${local_backup_path}"

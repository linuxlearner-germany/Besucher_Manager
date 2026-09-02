#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/archive/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RETENTION_MODE="apply"

for arg in "$@"; do
  case "${arg}" in
    --skip-retention) RETENTION_MODE="skip" ;;
    --retention-dry-run) RETENTION_MODE="dry-run" ;;
    *) echo "Usage: $0 [--skip-retention|--retention-dry-run]" >&2; exit 2 ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ENV file not found: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  sed -n "s/^${1}=//p" "${ENV_FILE}" | tail -n 1 | tr -d '\r'
}

db_name="$(read_env_value MSSQL_DATABASE)"
db_password="$(read_env_value MSSQL_PASSWORD)"
if [[ ! "${db_name}" =~ ^[A-Za-z0-9_]+$ || -z "${db_password}" ]]; then
  echo "MSSQL_DATABASE is invalid or MSSQL_PASSWORD is missing in ${ENV_FILE}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd -P)"
if [[ "${BACKUP_DIR}" == "/" || "${BACKUP_DIR}" == "${HOME}" ]]; then
  echo "Unsafe backup directory: ${BACKUP_DIR}" >&2
  exit 2
fi
sentinel_path="${BACKUP_DIR}/.besucher-manager-backup-root"
if [[ -e "${sentinel_path}" ]] && ! grep -qx 'besucher-manager-sql-backups-v1' "${sentinel_path}"; then
  echo "Backup directory has an invalid safety marker: ${BACKUP_DIR}" >&2
  exit 2
fi
printf '%s\n' 'besucher-manager-sql-backups-v1' >"${sentinel_path}"

container_id="$(docker compose --env-file "${ENV_FILE}" ps -q sqlserver)"
if [[ -z "${container_id}" || "$(docker inspect --format '{{.State.Running}}' "${container_id}")" != "true" ]]; then
  echo "sqlserver container is not running" >&2
  exit 1
fi
if [[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "${container_id}")" != "sqlserver" ]]; then
  echo "Resolved container is not the Compose sqlserver service; backup aborted." >&2
  exit 2
fi

backup_name="${db_name}_${TIMESTAMP}.bak"
container_backup_dir="/var/opt/mssql/backup"
container_backup_path="${container_backup_dir}/${backup_name}"
local_backup_path="${BACKUP_DIR}/${backup_name}"
marker_path="${local_backup_path}.verified.sha256"
if [[ -e "${local_backup_path}" || -e "${marker_path}" ]]; then
  echo "Backup target already exists: ${backup_name}" >&2
  exit 1
fi

backup_complete=0
cleanup() {
  if [[ -n "${container_id:-}" && "${container_backup_path:-}" =~ ^/var/opt/mssql/backup/[A-Za-z0-9_]+_[0-9]{8}_[0-9]{6}\.bak$ ]]; then
    docker exec "${container_id}" rm -f "${container_backup_path}" >/dev/null 2>&1 || true
  fi
  if [[ "${backup_complete}" -ne 1 ]]; then
    rm -f "${local_backup_path:-}" "${marker_path:-}"
  fi
}
trap cleanup EXIT

docker exec "${container_id}" mkdir -p "${container_backup_dir}"
docker exec -e "SQLCMDPASSWORD=${db_password}" "${container_id}" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -C -b \
  -Q "BACKUP DATABASE [${db_name}] TO DISK = N'${container_backup_path}' WITH INIT, COPY_ONLY, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'${container_backup_path}' WITH CHECKSUM;"

docker cp "${container_id}:${container_backup_path}" "${local_backup_path}"
[[ -s "${local_backup_path}" ]] || { echo "Copied backup is empty." >&2; exit 1; }

container_hash="$(docker exec "${container_id}" sha256sum "${container_backup_path}" | awk '{print $1}')"
local_hash="$(sha256sum "${local_backup_path}" | awk '{print $1}')"
if [[ ! "${local_hash}" =~ ^[a-f0-9]{64}$ || "${local_hash}" != "${container_hash}" ]]; then
  echo "Backup checksum mismatch after copying; backup is not accepted." >&2
  exit 1
fi
printf '%s  %s\n' "${local_hash}" "${backup_name}" >"${marker_path}"
backup_complete=1

status_tmp="${BACKUP_DIR}/.backup-status.tmp.$$"
printf '{"database":"%s","lastSuccessfulBackup":"%s","verified":true,"file":"%s"}\n' \
  "${db_name}" "$(date --iso-8601=seconds)" "${backup_name}" >"${status_tmp}"
mv "${status_tmp}" "${BACKUP_DIR}/backup-status.json"

case "${RETENTION_MODE}" in
  apply) python3 scripts/ops/prune_sql_backups.py --backup-dir "${BACKUP_DIR}" --database "${db_name}" --apply ;;
  dry-run) python3 scripts/ops/prune_sql_backups.py --backup-dir "${BACKUP_DIR}" --database "${db_name}" ;;
  skip) echo "Retention skipped by explicit option." ;;
esac

echo "Verified backup written outside the SQL Docker volume: ${local_backup_path}"

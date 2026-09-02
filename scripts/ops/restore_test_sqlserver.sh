#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT_DIR}/scripts/ops/docker_safety.sh"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/archive/backups}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ENV file not found: ${ENV_FILE}" >&2
  exit 1
fi
db_name="$(sed -n 's/^MSSQL_DATABASE=//p' "${ENV_FILE}" | tail -n 1 | tr -d '\r')"
[[ "${db_name}" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Invalid MSSQL_DATABASE." >&2; exit 1; }

BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd -P)"
grep -qx 'besucher-manager-sql-backups-v1' "${BACKUP_DIR}/.besucher-manager-backup-root" || {
  echo "Backup directory has no valid safety marker." >&2
  exit 2
}

latest_backup=""
while IFS= read -r candidate; do
  marker="${candidate}.verified.sha256"
  [[ -f "${marker}" ]] || continue
  if (cd "${BACKUP_DIR}" && sha256sum -c "$(basename "${marker}")" >/dev/null 2>&1); then
    latest_backup="${candidate}"
    break
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${db_name}_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9].bak" -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
[[ -n "${latest_backup}" ]] || { echo "No checksum-verified backup found for restore test." >&2; exit 1; }

run_id="$(date +%Y%m%d%H%M%S)_$$"
container_name="besucher_manager_restore_test_${run_id}"
volume_name="besucher_manager_restore_test_${run_id}_data"
restore_database="BesucherManagerRestoreTest_${run_id//_/}"
restore_password="RestoreTest_${RANDOM}_${RANDOM}!Aa"
backup_name="$(basename "${latest_backup}")"
staging_dir=""

cleanup() {
  if guard_restore_test_cleanup "${container_name}" "${volume_name}"; then
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
    docker volume rm "${volume_name}" >/dev/null 2>&1 || true
    if [[ "${staging_dir:-}" =~ ^/tmp/besucher-manager-restore\.[a-zA-Z0-9]+$ && -d "${staging_dir}" ]]; then
      rm -rf -- "${staging_dir}"
    fi
  else
    echo "Restore-test cleanup was blocked; isolated resources and staging data were not modified." >&2
  fi
}
trap cleanup EXIT

staging_dir="$(mktemp -d /tmp/besucher-manager-restore.XXXXXX)"
cp --no-preserve=ownership,mode "${latest_backup}" "${staging_dir}/${backup_name}"
chown -R 10001:10001 "${staging_dir}"
chmod 750 "${staging_dir}"
chmod 440 "${staging_dir}/${backup_name}"
original_hash="$(sha256sum "${latest_backup}" | awk '{print $1}')"
staging_hash="$(sha256sum "${staging_dir}/${backup_name}" | awk '{print $1}')"
[[ "${original_hash}" == "${staging_hash}" ]] || { echo "Restore staging copy checksum mismatch." >&2; exit 1; }

docker volume create \
  --label com.besucher-manager.environment=test \
  --label com.besucher-manager.purpose=restore-test \
  "${volume_name}" >/dev/null
docker run -d \
  --name "${container_name}" \
  --label com.besucher-manager.environment=test \
  --label com.besucher-manager.purpose=restore-test \
  -e ACCEPT_EULA=Y \
  -e MSSQL_PID=Express \
  -e "MSSQL_SA_PASSWORD=${restore_password}" \
  -v "${volume_name}:/var/opt/mssql" \
  -v "${staging_dir}:/backups:ro" \
  mcr.microsoft.com/mssql/server:2022-latest >/dev/null

echo "Waiting for isolated SQL restore container..."
ready=0
for _attempt in $(seq 1 90); do
  if docker exec -e "SQLCMDPASSWORD=${restore_password}" "${container_name}" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -Q "SELECT 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[[ "${ready}" -eq 1 ]] || { echo "Isolated SQL restore container did not become ready." >&2; exit 1; }

echo "Reading logical file names from checksum-verified backup..."
file_list=""
if ! file_list="$(docker exec -e "SQLCMDPASSWORD=${restore_password}" "${container_name}" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -C -b -W -h -1 -s '|' \
  -Q "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'/backups/${backup_name}';" 2>&1)"; then
  echo "Could not read the backup file list:" >&2
  printf '%s\n' "${file_list}" >&2
  exit 1
fi
logical_data="$(printf '%s\n' "${file_list}" | awk -F'|' '$3 == "D" {print $1; exit}')"
logical_log="$(printf '%s\n' "${file_list}" | awk -F'|' '$3 == "L" {print $1; exit}')"
[[ -n "${logical_data}" && -n "${logical_log}" ]] || { echo "Could not resolve logical backup files." >&2; exit 1; }
logical_data_sql="${logical_data//\'/\'\'}"
logical_log_sql="${logical_log//\'/\'\'}"

echo "Restoring into isolated database ${restore_database}..."
docker exec -e "SQLCMDPASSWORD=${restore_password}" "${container_name}" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -C -b \
  -Q "RESTORE VERIFYONLY FROM DISK = N'/backups/${backup_name}' WITH CHECKSUM; RESTORE DATABASE [${restore_database}] FROM DISK = N'/backups/${backup_name}' WITH MOVE N'${logical_data_sql}' TO N'/var/opt/mssql/data/${restore_database}.mdf', MOVE N'${logical_log_sql}' TO N'/var/opt/mssql/data/${restore_database}_log.ldf', RECOVERY;"

echo "Checking restored schema and central tables..."
docker exec -e "SQLCMDPASSWORD=${restore_password}" "${container_name}" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -C -b -d "${restore_database}" \
  -Q "SET NOCOUNT ON; IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL THROW 51000, 'schema_migrations missing', 1; IF OBJECT_ID(N'dbo.users', N'U') IS NULL THROW 51000, 'users missing', 1; IF OBJECT_ID(N'dbo.visitors', N'U') IS NULL THROW 51000, 'visitors missing', 1; IF OBJECT_ID(N'dbo.visits', N'U') IS NULL THROW 51000, 'visits missing', 1; IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL THROW 51000, 'audit_logs missing', 1; IF OBJECT_ID(N'dbo.error_logs', N'U') IS NULL THROW 51000, 'error_logs missing', 1; SELECT 'schema_migrations' AS table_name, COUNT_BIG(*) AS row_count FROM dbo.schema_migrations UNION ALL SELECT 'users', COUNT_BIG(*) FROM dbo.users UNION ALL SELECT 'visitors', COUNT_BIG(*) FROM dbo.visitors UNION ALL SELECT 'visits', COUNT_BIG(*) FROM dbo.visits UNION ALL SELECT 'audit_logs', COUNT_BIG(*) FROM dbo.audit_logs UNION ALL SELECT 'error_logs', COUNT_BIG(*) FROM dbo.error_logs;"

status_tmp="${BACKUP_DIR}/.restore-status.tmp.$$"
printf '{"database":"%s","lastSuccessfulRestoreTest":"%s","backup":"%s","verified":true}\n' \
  "${db_name}" "$(date --iso-8601=seconds)" "${backup_name}" >"${status_tmp}"
mv "${status_tmp}" "${BACKUP_DIR}/restore-status.json"
echo "Isolated restore test succeeded for ${backup_name}. Production database was not connected or modified."

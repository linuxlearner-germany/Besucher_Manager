#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

DO_PULL=0
DO_BACKUP=1

for arg in "$@"; do
  case "${arg}" in
    --pull)
      DO_PULL=1
      ;;
    --skip-backup)
      DO_BACKUP=0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: $0 [--pull] [--skip-backup]" >&2
      exit 1
      ;;
  esac
done

if [[ ${DO_PULL} -eq 1 ]]; then
  git pull --ff-only
fi

if [[ ${DO_BACKUP} -eq 1 ]]; then
  bash scripts/ops/backup_sqlserver.sh
fi

docker compose build app
docker compose up -d

app_container_id=""
for _ in $(seq 1 60); do
  app_container_id="$(docker compose ps -q app)"
  if [[ -n "${app_container_id}" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "${app_container_id}" ]]; then
  echo "app container was not created" >&2
  exit 1
fi

for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${app_container_id}")"
  if [[ "${health}" == "healthy" ]]; then
    echo "Update complete. app container is healthy."
    exit 0
  fi
  if [[ "${health}" == "unhealthy" || "${health}" == "exited" ]]; then
    echo "app container entered state: ${health}" >&2
    docker compose logs --tail=120 app
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for app health" >&2
docker compose logs --tail=120 app
exit 1

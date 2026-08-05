#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

DO_GIT_PULL=0
DO_BACKUP=1

if [[ ! -f .env ]]; then
  echo "Missing .env. The update was not started so existing configuration cannot be replaced." >&2
  exit 1
fi

ENV_BACKUP="$(mktemp)"
trap 'rm -f "${ENV_BACKUP}"' EXIT
cp -p .env "${ENV_BACKUP}"

for arg in "$@"; do
  case "${arg}" in
    --git-pull|--pull)
      DO_GIT_PULL=1
      ;;
    --skip-backup)
      DO_BACKUP=0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: $0 [--git-pull] [--skip-backup]" >&2
      exit 1
      ;;
  esac
done

if [[ ${DO_GIT_PULL} -eq 1 ]]; then
  git pull --ff-only
fi

if ! cmp -s .env "${ENV_BACKUP}"; then
  cp -p "${ENV_BACKUP}" .env
  echo "Restored the existing .env after the source update."
fi

if [[ ${DO_BACKUP} -eq 1 ]]; then
  bash scripts/ops/backup_sqlserver.sh
fi

docker compose pull
docker compose build --pull app
docker compose up -d --force-recreate app

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

#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

if ! command -v chronyc >/dev/null 2>&1 || ! systemctl cat chrony.service >/dev/null 2>&1; then
  echo "chrony and chronyc must be installed before the helper." >&2
  exit 1
fi
if ! grep -Eq '^[[:space:]]*sourcedir[[:space:]]+/etc/chrony/sources\.d([[:space:]]|$)' /etc/chrony/chrony.conf; then
  echo "/etc/chrony/chrony.conf must load /etc/chrony/sources.d." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ ! "${ROOT_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "Unsupported repository path for systemd unit generation." >&2
  exit 1
fi

REQUEST_DIR="${ROOT_DIR}/runtime/time-sync"
REQUEST_FILE="${REQUEST_DIR}/backup-ntp-server.json"
STATUS_FILE="${REQUEST_FILE}.status.json"
SOURCE_FILE="/etc/chrony/sources.d/besucher-manager.sources"
HELPER="/usr/local/libexec/besucher-manager-time-sync"

install -d -m 0755 "${REQUEST_DIR}" /etc/chrony/sources.d /usr/local/libexec
install -m 0755 "${ROOT_DIR}/scripts/ops/apply_backup_ntp_server.py" "${HELPER}"

if [[ ! -f "${REQUEST_FILE}" ]]; then
  install -m 0600 /dev/null "${REQUEST_FILE}"
  python3 -c 'import json,sys; json.dump({"enabled":False,"server":"","requestedAt":"installer"},sys.stdout); print()' > "${REQUEST_FILE}"
fi

cat > /etc/systemd/system/besucher-manager-time-sync.service <<EOF
[Unit]
Description=Apply Besucher Manager backup NTP source
After=chrony.service
Requires=chrony.service

[Service]
Type=oneshot
ExecStart=${HELPER} --request ${REQUEST_FILE} --source ${SOURCE_FILE} --status ${STATUS_FILE}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${REQUEST_DIR} /etc/chrony/sources.d
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX
LockPersonality=true
MemoryDenyWriteExecute=true
EOF

cat > /etc/systemd/system/besucher-manager-time-sync.path <<EOF
[Unit]
Description=Watch Besucher Manager backup NTP source request

[Path]
PathChanged=${REQUEST_FILE}
Unit=besucher-manager-time-sync.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now besucher-manager-time-sync.path
systemctl start besucher-manager-time-sync.service
echo "Besucher Manager time-sync helper installed."

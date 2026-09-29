#!/usr/bin/env bash
set -euo pipefail

tag="${1:?Usage: package_release.sh vX.Y.Z OUTPUT_DIR}"
output_dir="${2:?Usage: package_release.sh vX.Y.Z OUTPUT_DIR}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release tag: ${tag}" >&2
  exit 1
fi

for build_dir in "${root_dir}/apps/backend/dist" "${root_dir}/apps/frontend/dist"; do
  if [[ ! -d "${build_dir}" ]]; then
    echo "Missing build output: ${build_dir}" >&2
    exit 1
  fi
done

mkdir -p "${output_dir}"
output_dir="$(cd "${output_dir}" && pwd)"
manifest="$(mktemp)"
trap 'rm -f "${manifest}"' EXIT

cd "${root_dir}"
while IFS= read -r -d '' path; do
  case "${path}" in
    node_modules/*|*/node_modules/*|.idea/*|archive/*|uploads/*|apps/backend/dist/*|apps/frontend/dist/*|.env|config/mail-relay.yml)
      continue
      ;;
  esac
  printf '%s\0' "${path}" >> "${manifest}"
done < <(git ls-files -z)

find apps/backend/dist apps/frontend/dist -type f -print0 >> "${manifest}"

archive_name="besucher-manager-${tag}.tar.gz"
tar --null --files-from "${manifest}" \
  --transform "s,^,besucher-manager-${tag}/," \
  -czf "${output_dir}/${archive_name}"

(
  cd "${output_dir}"
  sha256sum "${archive_name}" > "${archive_name}.sha256"
)

echo "Packaged ${output_dir}/${archive_name}"

#!/usr/bin/env bash

# Shared guards for cleanup operations that intentionally remove Docker test
# resources. This file must be sourced by the calling script.

docker_safety_fail() {
  echo "SAFETY CHECK FAILED: $* No Docker resources were changed." >&2
  return 2
}

require_isolated_compose_project() {
  local project_name="${1:-}"
  local env_file="${2:-}"

  [[ "${BESUCHER_MANAGER_TEST_STACK:-}" == "1" ]] ||
    docker_safety_fail "BESUCHER_MANAGER_TEST_STACK is not set to the explicit test marker." || return
  [[ "${project_name}" != "besucher_manager" ]] ||
    docker_safety_fail "The production Compose project name was requested." || return
  [[ "${project_name}" =~ ^besucher_manager_e2e_[a-zA-Z0-9_-]+$ ]] ||
    docker_safety_fail "Unexpected E2E Compose project name '${project_name}'." || return
  [[ -n "${env_file}" && "$(basename "${env_file}")" == .env.ci.* ]] ||
    docker_safety_fail "The E2E environment file is not an isolated .env.ci.* file." || return
  [[ -f "${env_file}" ]] ||
    docker_safety_fail "The isolated E2E environment file does not exist." || return
  grep -qx 'BESUCHER_MANAGER_TEST_STACK=1' "${env_file}" ||
    docker_safety_fail "The isolated E2E environment file has no test marker." || return
}

guard_isolated_compose_cleanup() {
  local project_name="${1:-}"
  local env_file="${2:-}"
  require_isolated_compose_project "${project_name}" "${env_file}" || return

  local resource_id actual_project
  while IFS= read -r resource_id; do
    [[ -z "${resource_id}" ]] && continue
    actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "${resource_id}")"
    [[ "${actual_project}" == "${project_name}" ]] ||
      docker_safety_fail "Container ${resource_id} does not belong to isolated project ${project_name}." || return
  done < <(docker ps -aq --filter "label=com.docker.compose.project=${project_name}")

  while IFS= read -r resource_id; do
    [[ -z "${resource_id}" ]] && continue
    actual_project="$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "${resource_id}")"
    [[ "${actual_project}" == "${project_name}" ]] ||
      docker_safety_fail "Volume ${resource_id} does not belong to isolated project ${project_name}." || return
  done < <(docker volume ls -q --filter "label=com.docker.compose.project=${project_name}")
}

guard_restore_test_cleanup() {
  local container_name="${1:-}"
  local volume_name="${2:-}"

  [[ "${container_name}" =~ ^besucher_manager_restore_test_[a-zA-Z0-9_-]+$ ]] ||
    docker_safety_fail "Unexpected restore-test container name '${container_name}'." || return
  [[ "${volume_name}" =~ ^besucher_manager_restore_test_[a-zA-Z0-9_-]+_data$ ]] ||
    docker_safety_fail "Unexpected restore-test volume name '${volume_name}'." || return

  if docker inspect "${container_name}" >/dev/null 2>&1; then
    [[ "$(docker inspect --format '{{ index .Config.Labels "com.besucher-manager.environment" }}' "${container_name}")" == "test" ]] ||
      docker_safety_fail "Restore container is not labelled as test." || return
    [[ "$(docker inspect --format '{{ index .Config.Labels "com.besucher-manager.purpose" }}' "${container_name}")" == "restore-test" ]] ||
      docker_safety_fail "Restore container has no restore-test purpose label." || return
  fi

  if docker volume inspect "${volume_name}" >/dev/null 2>&1; then
    [[ "$(docker volume inspect --format '{{ index .Labels "com.besucher-manager.environment" }}' "${volume_name}")" == "test" ]] ||
      docker_safety_fail "Restore volume is not labelled as test." || return
    [[ "$(docker volume inspect --format '{{ index .Labels "com.besucher-manager.purpose" }}' "${volume_name}")" == "restore-test" ]] ||
      docker_safety_fail "Restore volume has no restore-test purpose label." || return
  fi
}

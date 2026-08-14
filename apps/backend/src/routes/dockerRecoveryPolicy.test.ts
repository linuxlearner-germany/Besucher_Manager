import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(__dirname, "../../../..");
const composeSource = readFileSync(resolve(repositoryRoot, "docker-compose.yml"), "utf8");
const e2eSource = readFileSync(resolve(repositoryRoot, "scripts/ci/run_docker_e2e.sh"), "utf8");

test("Docker E2E cannot remove or bind the production Compose stack", () => {
  assert.match(e2eSource, /E2E_PROJECT_NAME=.*besucher_manager_e2e_/);
  assert.match(e2eSource, /E2E_PROJECT_NAME.*== "besucher_manager"/);
  assert.match(e2eSource, /export COMPOSE_PROJECT_NAME=/);
  assert.match(e2eSource, /HOST_PORT=13030/);
  assert.match(e2eSource, /SQLSERVER_HOST_PORT=0/);
  assert.match(composeSource, /\$\{HOST_PORT:-3030\}:3030/);
  assert.match(composeSource, /\$\{SQLSERVER_HOST_PORT:-1433\}:1433/);
});

test("database bootstrap remaps an orphaned restored user to its login", () => {
  assert.match(composeSource, /ALTER USER \[\$\$\{MSSQL_USER\}\] WITH LOGIN = \[\$\$\{MSSQL_USER\}\]/);
});

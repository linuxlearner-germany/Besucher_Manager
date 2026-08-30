import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const adminSource = readFileSync(resolve(__dirname, "admin.ts"), "utf8");
const composeSource = readFileSync(resolve(__dirname, "../../../../docker-compose.yml"), "utf8");
const installerSource = readFileSync(resolve(__dirname, "../../../../scripts/ops/install_time_sync_helper.sh"), "utf8");

test("time-server settings and tests require the admin.system permission", () => {
  const routes = adminSource.match(/adminRouter\.get\("\/api\/admin\/system-settings\/time-sync"[\s\S]*?adminRouter\.post\("\/api\/admin\/system-settings\/workflow-email\/test"/)?.[0] ?? "";
  assert.match(routes, /adminRouter\.get\("\/api\/admin\/system-settings\/time-sync"/);
  assert.match(routes, /adminRouter\.put\("\/api\/admin\/system-settings\/time-sync"/);
  assert.match(routes, /adminRouter\.post\("\/api\/admin\/system-settings\/time-sync\/test"/);
  assert.equal((routes.match(/requirePermission\(request, response, "admin\.system"\)/g) ?? []).length, 3);
  assert.match(routes, /BACKUP_NTP_SERVER_UPDATED/);
  assert.match(routes, /BACKUP_NTP_SERVER_TESTED/);
});

test("time synchronization does not grant host-time or Docker privileges to the app container", () => {
  assert.doesNotMatch(composeSource, /SYS_TIME/);
  assert.doesNotMatch(composeSource, /docker\.sock/);
  assert.match(composeSource, /\.\/runtime\/time-sync:\/app\/runtime\/time-sync/);
  assert.match(installerSource, /NoNewPrivileges=true/);
  assert.match(installerSource, /CapabilityBoundingSet=/);
  assert.match(installerSource, /RestrictAddressFamilies=AF_UNIX/);
});

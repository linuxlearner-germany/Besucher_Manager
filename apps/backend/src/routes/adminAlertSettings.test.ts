import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routeSource = readFileSync(resolve(__dirname, "admin.ts"), "utf8");
const alertSource = readFileSync(resolve(__dirname, "../lib/adminAlerting.ts"), "utf8");
const serverSource = readFileSync(resolve(__dirname, "../server.ts"), "utf8");
const startSource = readFileSync(resolve(__dirname, "../scripts/start.ts"), "utf8");
const uiSource = readFileSync(resolve(__dirname, "../../../frontend/src/components/admin/AdminSections.tsx"), "utf8");

test("admin alert settings, updates and tests require admin.system", () => {
  const routes = routeSource.match(/adminRouter\.get\("\/api\/admin\/system-settings\/admin-alerts"[\s\S]*?adminRouter\.post\("\/api\/admin\/system-settings\/workflow-email\/test"/)?.[0] ?? "";
  assert.match(routes, /adminRouter\.get\("\/api\/admin\/system-settings\/admin-alerts"/);
  assert.match(routes, /adminRouter\.put\("\/api\/admin\/system-settings\/admin-alerts"/);
  assert.match(routes, /adminRouter\.post\("\/api\/admin\/system-settings\/admin-alerts\/test"/);
  assert.equal((routes.match(/requirePermission\(request, response, "admin\.system"\)/g) ?? []).length, 3);
  assert.match(routes, /ADMIN_ERROR_ALERT_SETTINGS_UPDATED/);
  assert.match(routes, /ADMIN_ERROR_ALERT_TEST_SENT/);
});

test("alert job runs periodically, groups errors and does not recursively log its own mail failure", () => {
  assert.match(serverSource, /setInterval\(runAlertJob, 5 \* 60 \* 1000\)/);
  assert.match(startSource, /setInterval\(runAlertJob, 5 \* 60 \* 1000\)/);
  assert.match(alertSource, /GROUP BY \[level\], error_code/);
  assert.match(alertSource, /TOP 25/);
  assert.doesNotMatch(alertSource, /writeErrorLog/);
  assert.match(alertSource, /if \(!delivered\) throw new Error\("admin_alert_mail_relay_unavailable"\)/);
});

test("admin UI supports multiple recipients, minimum severity, save and test", () => {
  assert.match(uiSource, /Admin-Fehlerbenachrichtigungen/);
  assert.match(uiSource, /Empfängeradressen/);
  assert.match(uiSource, /Nur Fehler/);
  assert.match(uiSource, /Fehler und Warnungen/);
  assert.match(uiSource, /Testmail senden/);
  assert.match(uiSource, /Benachrichtigungen speichern/);
});

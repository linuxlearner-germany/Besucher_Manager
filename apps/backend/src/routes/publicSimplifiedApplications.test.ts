import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const route = readFileSync(resolve(__dirname, "publicSimplifiedApplications.ts"), "utf8");
const service = readFileSync(resolve(__dirname, "../lib/publicSimplifiedApplications.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../migrations/038_public_simplified_applications.sql"), "utf8");

test("public workflow reparses XLSX on preview and submit and requires CSRF", () => {
  assert.equal((route.match(/parseAndValidatePublicApplicationXlsx\(file\.buffer\)/g) ?? []).length, 2);
  assert.match(route, /hasValidCsrfToken/);
  assert.match(route, /X-Application-Verification-Token/i);
});

test("SiBe setting and KSKdt decisions use role guards and strict schemas", () => {
  assert.match(route, /settingSchema=.*\.strict\(\)/);
  assert.match(route, /requireRole\(request,response,\["sibe"\]\)/);
  assert.match(route, /requireRole\(request,response,\["kaskdt"\]\)/);
});

test("approval is idempotently linked to one public-source visit", () => {
  assert.match(service, /created_visit_id/);
  assert.match(service, /N'public_simplified_excel'/);
  assert.match(migration, /UNIQUE INDEX ux_public_simplified_entries_created_visit/);
  assert.match(service, /status=N'pending'/);
});

test("verification stores only SHA-256 token hashes and submitted mail uses outbox", () => {
  assert.match(service, /crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.doesNotMatch(migration, /token_value|plain.*token/i);
  assert.match(migration, /public_simplified_application_mail_outbox/);
});

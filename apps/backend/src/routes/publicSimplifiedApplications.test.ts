import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const route = readFileSync(resolve(__dirname, "publicSimplifiedApplications.ts"), "utf8");
const sibeRoute = readFileSync(resolve(__dirname, "sibe.ts"), "utf8");
const service = readFileSync(resolve(__dirname, "../lib/publicSimplifiedApplications.ts"), "utf8");
const gateService = readFileSync(resolve(__dirname, "../lib/publicPreRegistrations.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../migrations/038_public_simplified_applications.sql"), "utf8");
const idempotencyMigration = readFileSync(resolve(__dirname, "../../migrations/039_public_simplified_application_idempotency.sql"), "utf8");
const outboxClaimMigration = readFileSync(resolve(__dirname, "../../migrations/040_public_simplified_mail_outbox_claims.sql"), "utf8");
const mailRelay = readFileSync(resolve(__dirname, "../lib/mailRelay.ts"), "utf8");
const simplifiedSibeEntry = readFileSync(resolve(__dirname, "../lib/simplifiedSibeEntry.ts"), "utf8");
const dockerfile = readFileSync(resolve(__dirname, "../../../../Dockerfile"), "utf8");

test("public workflow reparses XLSX on preview and submit and requires CSRF", () => {
  assert.equal((route.match(/parseAndValidatePublicApplicationXlsx\(file\.buffer\)/g) ?? []).length, 2);
  assert.match(route, /hasValidCsrfToken/);
  assert.match(route, /X-Application-Verification-Token/i);
});

test("public and internal template downloads use the same generator with freshly queried active gates", () => {
  assert.match(route, /buildSimplifiedImportTemplate\(await listActiveGates\(\)\)/);
  assert.match(sibeRoute, /buildSimplifiedImportTemplate\(await listActiveGates\(\)\)/);
  assert.match(gateService, /FROM dbo\.gates\s+WHERE is_active = 1\s+ORDER BY sort_order ASC, name ASC/);
  assert.doesNotMatch(gateService, /cachedActiveGates|activeGatesCache/i);
});

test("SiBe setting and KSKdt decisions use role guards and strict schemas", () => {
  assert.match(route, /settingSchema=.*\.strict\(\)/);
  assert.match(route, /requireRole\(request,response,\["sibe"\]\)/);
  assert.equal((route.match(/requireRole\(request,response,\["admin","kaskdt"\]\)/g) ?? []).length, 5);
});

test("public bootstrap exposes the persisted verification mode read-only", () => {
  assert.match(route, /\/api\/public\/simplified-applications\/bootstrap/);
  assert.match(route, /requireEmailVerification:settings\.get\(WORKFLOW_SETTING_KEYS\.publicXlsxRequireEmailVerification\)!=="false"/);
  assert.match(route, /PUBLIC_XLSX_BOOTSTRAP_FAILED/);
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

test("workflow mails consistently name the simplified visitor policy", () => {
  assert.match(service, /Ihr Antrag zur vereinfachten Besucherregelung wurde eingereicht/);
  assert.match(service, /Neuer Antrag zur vereinfachten Besucherregelung/);
  assert.match(service, /Entscheidung zu Ihrem Antrag der vereinfachten Besucherregelung/);
});

test("public submit uses a persistent client request id for idempotent retries", () => {
  assert.match(route, /clientRequestId:z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(service, /client_request_id = @clientRequestId/);
  assert.match(service, /INSERT INTO dbo\.public_simplified_applications\([^)]*client_request_id/);
  assert.match(idempotencyMigration, /UNIQUE INDEX ux_public_simplified_applications_client_request/);
  assert.match(idempotencyMigration, /WHERE client_request_id IS NOT NULL/);
});

test("mail TLS verification cannot be bypassed and the runtime image has a CA store", () => {
  assert.doesNotMatch(mailRelay, /rejectUnauthorized\s*:\s*false|allowInvalidCertificate/);
  assert.match(dockerfile, /apt-get install -y --no-install-recommends ca-certificates/);
});

test("new simplified visits notify nationality subscribers only after commit", () => {
  assert.match(simplifiedSibeEntry, /await transaction\.commit\(\);[\s\S]*notifyNationalitySubscribers/);
  assert.match(service, /await tx\.commit\(\);\s*\}[\s\S]*for\(const notification of nationalityNotifications\) void notifyNationalitySubscribers/);
  assert.match(service, /if\(!entry\.nationality_code\)return null/);
});

test("mail outbox rows are atomically claimed before transport delivery", () => {
  assert.match(outboxClaimMigration, /claim_token UNIQUEIDENTIFIER/);
  assert.match(outboxClaimMigration, /claim_expires_at DATETIME2/);
  assert.match(service, /FROM dbo\.public_simplified_application_mail_outbox WITH\(UPDLOCK,READPAST,ROWLOCK,READCOMMITTEDLOCK\)/);
  assert.match(service, /claimTransaction\.begin\(sql\.ISOLATION_LEVEL\.READ_COMMITTED\)/);
  assert.match(service, /UPDATE claimable/);
  assert.match(service, /OUTPUT inserted\.id/);
  assert.match(service, /claim_token=@claimToken/);
  assert.doesNotMatch(service, /SELECT id,mail_type AS mailType[\s\S]*sent_at IS NULL ORDER BY created_at/);
  assert.match(service, /deliverApplicationMailOutbox\(applicationId\)\.catch/);
});

test("verification transport failures use a safe correlated public error", () => {
  assert.match(route, /PUBLIC_XLSX_VERIFICATION_MAIL_FAILED/);
  assert.match(route, /requestId:response\.req\?\.requestId/);
  assert.match(route, /Der Antrag konnte derzeit nicht vollständig verarbeitet werden/);
  assert.doesNotMatch(route, /unable to verify the first certificate/);
});

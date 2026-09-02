import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routeSource = readFileSync(resolve(__dirname, "api.ts"), "utf8");
const accessSource = readFileSync(resolve(__dirname, "../lib/publicPreRegistrationAccess.ts"), "utf8");
const migrationSource = readFileSync(resolve(__dirname, "../../migrations/037_public_preregistration_access.sql"), "utf8");

test("public confirmation API uses fixed unauthenticated routes, no-store and rate limiting", () => {
  assert.match(routeSource, /get\("\/api\/public\/pre-registration-confirmation"/);
  assert.match(routeSource, /patch\("\/api\/public\/pre-registration-confirmation"/);
  assert.doesNotMatch(routeSource, /pre-registration-confirmation\/:token/);
  assert.match(routeSource, /Cache-Control", "no-store/);
  assert.match(routeSource, /Referrer-Policy", "no-referrer/);
  assert.match(routeSource, /checkRateLimit\(publicConfirmationRateLimitKey/);
});

test("public DTO is allowlisted and never selects internal or document fields", () => {
  assert.match(accessSource, /\.strict\(\)/);
  assert.doesNotMatch(accessSource, /idDocumentNumber: row/);
  assert.doesNotMatch(accessSource, /submittedIpAddress: row/);
  assert.doesNotMatch(accessSource, /hostEmail: row/);
  assert.match(accessSource, /changed_fields: changedFields/);
  assert.doesNotMatch(accessSource, /metadata: \{[^}]*token/);
});

test("migration stores only unique token hashes with expiry and revocation", () => {
  assert.match(migrationSource, /token_hash CHAR\(64\) NOT NULL/);
  assert.match(migrationSource, /expires_at DATETIME2 NOT NULL/);
  assert.match(migrationSource, /revoked_at DATETIME2 NULL/);
  assert.match(migrationSource, /UNIQUE INDEX UX_public_visit_access_tokens_hash/);
});

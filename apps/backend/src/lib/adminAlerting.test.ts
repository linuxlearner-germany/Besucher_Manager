import assert from "node:assert/strict";
import test from "node:test";

function loadModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
  return require("./adminAlerting") as typeof import("./adminAlerting");
}

test("admin alert recipients are normalized, deduplicated and support multiple addresses", () => {
  const { normalizeAdminAlertRecipients } = loadModule();
  assert.deepEqual(
    normalizeAdminAlertRecipients([" Admin1@Example.org ", "admin2@example.org", "ADMIN1@example.org"]),
    ["admin1@example.org", "admin2@example.org"]
  );
});

test("admin alert recipients reject invalid addresses and oversized lists", () => {
  const { normalizeAdminAlertRecipients } = loadModule();
  assert.throws(() => normalizeAdminAlertRecipients(["not-an-address"]), /invalid_admin_alert_recipients/);
  assert.throws(
    () => normalizeAdminAlertRecipients(Array.from({ length: 21 }, (_, index) => `admin${index}@example.org`)),
    /invalid_admin_alert_recipients/
  );
});

test("admin alert summaries redact credentials and remove query strings", () => {
  const { buildAdminAlertMail } = loadModule();
  const mail = buildAdminAlertMail(2, [{
    level: "error",
    errorCode: "TEST_FAILURE",
    message: "password=super-secret-value",
    requestPath: "/api/test?token=private-token",
    count: 2,
    lastOccurredAt: new Date("2026-08-30T19:00:00.000Z")
  }]);
  assert.doesNotMatch(mail.text, /super-secret-value|private-token/);
  assert.match(mail.text, /2× \[error\] TEST_FAILURE · \/api\/test/);
  assert.match(mail.subject, /2 neue Fehlermeldungen/);
});

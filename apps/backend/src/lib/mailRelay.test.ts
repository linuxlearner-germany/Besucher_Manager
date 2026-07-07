import test from "node:test";
import assert from "node:assert/strict";

function loadModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";

  delete require.cache[require.resolve("../config/env")];
  delete require.cache[require.resolve("./mailRelay")];

  return require("./mailRelay") as typeof import("./mailRelay");
}

test("mergeMailRecipients normalizes and deduplicates addresses", () => {
  const { mergeMailRecipients } = loadModule();

  const recipients = mergeMailRecipients(
    [" SIBE@example.org ", "admin@example.org"],
    ["sibe@example.org", "", "ADMIN@example.org", undefined, null]
  );

  assert.deepEqual(recipients, ["sibe@example.org", "admin@example.org"]);
});

import test from "node:test";
import assert from "node:assert/strict";

function loadModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";

  return require("./retentionCleanup") as typeof import("./retentionCleanup");
}

test("retention batches remain below the SQL Server parameter limit", () => {
  const { RETENTION_BATCH_SIZE } = loadModule();
  const maximumParameters = RETENTION_BATCH_SIZE * 2 + 2;

  assert.ok(maximumParameters < 2100);
});

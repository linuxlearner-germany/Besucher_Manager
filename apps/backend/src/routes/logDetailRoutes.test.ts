import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const adminSource = readFileSync(resolve(__dirname, "admin.ts"), "utf8");

test("audit and error detail routes enforce their dedicated permissions", () => {
  assert.match(adminSource, /get\("\/api\/admin\/audit-logs\/:id"[\s\S]*?requirePermission\(request, response, "logs\.audit"\)/);
  assert.match(adminSource, /get\("\/api\/admin\/error-logs\/:id"[\s\S]*?requirePermission\(request, response, "logs\.errors"\)/);
});

test("log detail routes return specific not-found errors and redacted detail data", () => {
  assert.match(adminSource, /AUDIT_LOG_NOT_FOUND/);
  assert.match(adminSource, /ERROR_LOG_NOT_FOUND/);
  assert.match(adminSource, /parseRedactedLogJson\(entry\.metadataJson\)/);
  assert.match(adminSource, /redactSensitiveText\(entry\.stackTrace\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("maintenance middleware keeps status and authentication reachable and gives admins a bypass", () => {
  const source = readFileSync(resolve(__dirname, "../app.ts"), "utf8");
  assert.match(source, /\/api\/maintenance\/status/);
  assert.match(source, /request\.path\.startsWith\("\/api\/auth\/"\)/);
  assert.match(source, /hasRole\(user, "admin"\)/);
  assert.match(source, /503, "MAINTENANCE_MODE"/);
});

test("user deletion distinguishes hard deletion and tombstone pseudonymization", () => {
  const source = readFileSync(resolve(__dirname, "admin.ts"), "utf8");
  const endpoint = source.match(/adminRouter\.delete\("\/api\/admin\/users\/:id"[\s\S]*?adminRouter\.put\("\/api\/texts\/:id"/)?.[0] ?? "";
  assert.match(endpoint, /deletionMode: "hard_deleted" \| "tombstoned"/);
  assert.match(endpoint, /is_tombstoned = 1/);
  assert.match(endpoint, /Gelöschter Benutzer/);
  assert.match(endpoint, /USER_DELETE_CONFLICT/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "admin.ts"), "utf8");

test("creating a guard requires and persists an active gate", () => {
  assert.match(source, /value\.role === "guard" && !value\.gateId/);
  const endpoint = source.match(/adminRouter\.post\("\/api\/admin\/users"[\s\S]*?adminRouter\.put\("\/api\/admin\/users\/:id"/)?.[0] ?? "";
  assert.match(endpoint, /data\.role === "guard"/);
  assert.match(endpoint, /FROM dbo\.gates WHERE id = @gateId AND is_active = 1/);
  assert.match(endpoint, /\.input\("gateId", sql\.UniqueIdentifier, gateId\)/);
  assert.doesNotMatch(endpoint, /\.input\("gateId", sql\.UniqueIdentifier, null\)/);
});

test("updating a guard persists the requested gate and clears it for other roles", () => {
  const endpoint = source.match(/adminRouter\.put\("\/api\/admin\/users\/:id"[\s\S]*?adminRouter\.delete\("\/api\/admin\/users\/:id"/)?.[0] ?? "";
  assert.match(endpoint, /data\.gateId !== undefined \? data\.gateId : currentUser\.gateId/);
  assert.match(endpoint, /if \(nextRole === "guard"\)/);
  assert.match(endpoint, /FROM dbo\.gates WHERE id = @gateId AND is_active = 1/);
  assert.match(endpoint, /\.input\("gateId", sql\.UniqueIdentifier, nextGateId\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "admin.ts"), "utf8");

test("creating a guard does not persist a gate assignment", () => {
  const endpoint = source.match(/adminRouter\.post\("\/api\/admin\/users"[\s\S]*?adminRouter\.put\("\/api\/admin\/users\/:id"/)?.[0] ?? "";
  assert.match(endpoint, /const gateId: string \| null = null/);
  assert.doesNotMatch(endpoint, /Fuer ein Wache-Konto muss eine aktive Wache/);
});

test("updating a guard clears legacy gate assignments", () => {
  const endpoint = source.match(/adminRouter\.put\("\/api\/admin\/users\/:id"[\s\S]*?adminRouter\.delete\("\/api\/admin\/users\/:id"/)?.[0] ?? "";
  assert.match(endpoint, /const nextGateId: string \| null = null/);
  assert.match(endpoint, /\.input\("gateId", sql\.UniqueIdentifier, nextGateId\)/);
});

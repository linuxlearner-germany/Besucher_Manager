import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const start = readFileSync(resolve(__dirname, "start.ts"), "utf8");
const users = readFileSync(resolve(__dirname, "../lib/users.ts"), "utf8");

test("startup uses an insert-only admin bootstrap", () => {
  assert.match(start, /createAdminIfMissing/);
  assert.doesNotMatch(start, /createOrUpdateAdmin/);
  assert.doesNotMatch(readFileSync(resolve(__dirname, "createAdmin.ts"), "utf8"), /createOrUpdateAdmin/);
  assert.match(users, /export async function createAdminIfMissing/);
  assert.match(users, /if \(existingId\) \{[\s\S]*?transaction\.commit\(\);[\s\S]*?created: false/);
});

test("startup bootstrap does not synchronize existing admin profile fields", () => {
  const bootstrap = users.slice(users.indexOf("export async function createAdminIfMissing"));
  const existingBranch = bootstrap.slice(0, bootstrap.indexOf("const passwordHash = await hashPassword"));
  assert.doesNotMatch(existingBranch, /UPDATE dbo\.users|passwordHash|is_active|role =/i);
});

test("an existing admin may start without an initial password configured", () => {
  assert.match(start, /if \(adminUsername && !adminPassword\)/);
  assert.match(start, /const existingAdmin = await findUserForLogin\(adminUsername\)/);
  assert.match(start, /initial admin password is required when the configured admin user does not exist/);
});

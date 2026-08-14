import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Request, Response } from "express";
import { getDefaultMenuAccessForRole, getDefaultPermissionsForRole, type AppRole, type AuthenticatedUser } from "../lib/visitWorkflow";

process.env.NODE_ENV = "test";
process.env.APP_SECRET = "simplified-policy-access-test";
process.env.MSSQL_HOST = "test-host";
process.env.MSSQL_DATABASE = "test-database";
process.env.MSSQL_USER = "test-user";
process.env.MSSQL_PASSWORD = "test-password";

const sharedModule = import("./shared.js");

function makeUser(role: AppRole): AuthenticatedUser {
  return {
    id: `${role}-id`, username: role, role, gateId: null, groups: [],
    menuAccess: getDefaultMenuAccessForRole(role),
    permissions: getDefaultPermissionsForRole(role)
  };
}

function makeResponse() {
  const result: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };
  const response = {
    locals: {},
    status(statusCode: number) { result.statusCode = statusCode; return response; },
    json(body: unknown) { result.body = body; return response; }
  } as unknown as Response;
  return { response, result };
}

async function checkAccess(role: AppRole | null) {
  const { requireRole } = await sharedModule;
  const request = { auth: role ? makeUser(role) : null } as Request;
  const { response, result } = makeResponse();
  const user = await requireRole(request, response, ["sibe"]);
  return { user, ...result };
}

test("simplified visit policy allows SiBe", async () => {
  const access = await checkAccess("sibe");
  assert.equal(access.user?.role, "sibe");
  assert.equal(access.statusCode, null);
});

test("simplified visit policy rejects every other authenticated role with 403", async () => {
  for (const role of ["admin", "guard", "kaskdt", "custom"] as const) {
    const access = await checkAccess(role);
    assert.equal(access.user, null, role);
    assert.equal(access.statusCode, 403, role);
  }
});

test("simplified visit policy rejects unauthenticated requests with 401", async () => {
  const access = await checkAccess(null);
  assert.equal(access.user, null);
  assert.equal(access.statusCode, 401);
});

test("every simplified policy write endpoint uses the SiBe-only role guard", () => {
  const source = readFileSync(resolve(__dirname, "sibe.ts"), "utf8");
  for (const path of [
    "/api/sibe/visits/simplified",
    "/api/sibe/visits/simplified-rule/preview",
    "/api/sibe/visits/simplified-rule/import"
  ]) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const endpoint = source.match(new RegExp(`sibeRouter\\.post\\("${escapedPath}"[\\s\\S]*?if \\(!user\\) return;`));
    assert.ok(endpoint, `${path} must exist`);
    assert.match(endpoint[0], /requireRole\(request, response, \["sibe"\]\)/, path);
  }
});

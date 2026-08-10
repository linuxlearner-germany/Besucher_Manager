import test from "node:test";
import assert from "node:assert/strict";
import { simplifiedSibeVisitorSchema } from "./simplifiedSibeRegistrationSchema";
import {
  canUseSimplifiedSibeRegistration,
  getDefaultMenuAccessForRole,
  getDefaultPermissionsForRole,
  type AuthenticatedUser
} from "./visitWorkflow";

function makeUser(role: AuthenticatedUser["role"], simplifiedRuleActive: boolean): AuthenticatedUser {
  const menuAccess: AuthenticatedUser["menuAccess"] = getDefaultMenuAccessForRole(role).filter((key) => key !== "import");
  if (simplifiedRuleActive) menuAccess.push("import");
  return {
    id: `${role}-id`, username: role, role, gateId: null, groups: [], menuAccess,
    permissions: getDefaultPermissionsForRole(role)
  };
}

test("normal users cannot activate simplified SiBe validation through client input", () => {
  assert.equal(canUseSimplifiedSibeRegistration(makeUser("guard", true)), false);
  assert.equal(canUseSimplifiedSibeRegistration(makeUser("admin", true)), false);
});

test("SiBe without activated simplified visitor rule remains blocked", () => {
  assert.equal(canUseSimplifiedSibeRegistration(makeUser("sibe", false)), false);
});

test("authorized SiBe with activated rule can use minimal visitor data", () => {
  const user = makeUser("sibe", true);
  const parsed = simplifiedSibeVisitorSchema.safeParse({ firstName: "Erika", lastName: "Muster" });
  assert.equal(canUseSimplifiedSibeRegistration(user), true);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.company, "");
    assert.equal(parsed.data.nationalityCode, null);
  }
});

test("simplified SiBe registration still requires a person's name", () => {
  assert.equal(simplifiedSibeVisitorSchema.safeParse({ firstName: "", lastName: "" }).success, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { canCreateSimplifiedSibeEntry } from "./simplifiedSibeEntryAuthorization";
import { simplifiedSibeEntrySchema } from "./simplifiedSibeEntrySchema";
import { createPublicPreRegistrationSchema } from "./publicPreRegistrationSchema";
import { getDefaultPermissionsForRole, type AuthenticatedUser } from "./visitWorkflow";

const gateId = "5F5EA42B-69C9-43BF-BBB5-EEBF9D9E958B";

function makeUser(role: AuthenticatedUser["role"]): AuthenticatedUser {
  return {
    id: `${role}-id`,
    username: role,
    role,
    gateId: null,
    groups: [],
    menuAccess: [],
    permissions: getDefaultPermissionsForRole(role)
  };
}

test("simplified SiBe entry rejects missing identity and visit data", () => {
  const parsed = simplifiedSibeEntrySchema.safeParse({
    gateId,
    validFrom: "2026-08-10",
    validUntil: "2026-08-11"
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.deepEqual(Object.keys(parsed.error.flatten().fieldErrors).sort(), ["company", "firstName", "hostName", "lastName", "purpose"]);
});

test("SiBe can provide optional personal data", () => {
  const parsed = simplifiedSibeEntrySchema.safeParse({
    gateId,
    validFrom: "2026-08-10",
    validUntil: "2026-08-10",
    firstName: "Erika",
    lastName: "Muster",
    company: "Beispiel GmbH",
    hostName: "Maria Muster",
    purpose: "Besprechung",
    nationalityCode: "DE",
    idDocumentType: "identity_card",
    idDocumentNumber: "freiwillig"
  });

  assert.equal(parsed.success, true);
});

test("simplified entry still requires an active-gate candidate and validity range", () => {
  assert.equal(simplifiedSibeEntrySchema.safeParse({}).success, false);
  assert.equal(simplifiedSibeEntrySchema.safeParse({
    gateId,
    validFrom: "2026-08-11",
    validUntil: "2026-08-10"
  }).success, false);
});

test("only the SiBe role can use simplified entry", () => {
  const sibe = makeUser("sibe");
  assert.equal(canCreateSimplifiedSibeEntry(sibe), true);
  assert.equal(canCreateSimplifiedSibeEntry(makeUser("guard")), false);
  assert.equal(canCreateSimplifiedSibeEntry(makeUser("admin")), false);
  assert.equal(canCreateSimplifiedSibeEntry(makeUser("custom")), false);
  assert.equal(canCreateSimplifiedSibeEntry(null), false);

  sibe.permissions.visits.create = false;
  assert.equal(canCreateSimplifiedSibeEntry(sibe), true);
});

test("the supported SiBe and KasKdt dual role keeps SiBe write access", () => {
  const user = makeUser("sibe");
  user.roles = ["sibe", "kaskdt"];
  assert.equal(canCreateSimplifiedSibeEntry(user), true);
});

test("a client flag cannot enable simplified validation for the public schema", () => {
  const publicSchema = createPublicPreRegistrationSchema(new Set(["visitor_first_name", "visitor_last_name"]));
  const parsed = publicSchema.safeParse({
    simplified: true,
    firstName: "",
    lastName: "",
    validFrom: "2026-08-10",
    validUntil: "2026-08-10"
  });

  assert.equal(parsed.success, false);
});

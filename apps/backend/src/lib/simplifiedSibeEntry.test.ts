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

test("SiBe can create a simplified visit without personal data", () => {
  const parsed = simplifiedSibeEntrySchema.safeParse({
    gateId,
    validFrom: "2026-08-10",
    validUntil: "2026-08-11"
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.firstName, "");
    assert.equal(parsed.data.lastName, "");
    assert.equal(parsed.data.company, "");
    assert.equal(parsed.data.nationalityCode, null);
    assert.equal(parsed.data.idDocumentNumber, "");
  }
});

test("SiBe can provide optional personal data", () => {
  const parsed = simplifiedSibeEntrySchema.safeParse({
    gateId,
    validFrom: "2026-08-10",
    validUntil: "2026-08-10",
    firstName: "Erika",
    lastName: "Muster",
    company: "Beispiel GmbH",
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

test("obsolete required configuration cannot make public fields mandatory", () => {
  const publicSchema = createPublicPreRegistrationSchema(new Set(["visitor_first_name", "visitor_last_name"]));
  const parsed = publicSchema.safeParse({
    simplified: true,
    firstName: "",
    lastName: "",
    validFrom: "2026-08-10",
    validUntil: "2026-08-10"
  });

  assert.equal(parsed.success, true);
});

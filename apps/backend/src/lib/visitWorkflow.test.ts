import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_STATUS,
  getDefaultMenuAccessForRole,
  getDefaultPermissionsForRole,
  assertCanCheckIn,
  assertCanCheckOut,
  assertVisitApprovedForCheckIn,
  assertReturnedBadgeNumberMatches,
  assertCanUpdateHostSignature,
  canAccessGate,
  canManageGuardScopedVisit,
  HOST_SIGNATURE_STATUS,
  VISIT_STATUS,
  type AuthenticatedUser
} from "./visitWorkflow";

function makeUser(role: AuthenticatedUser["role"], gateId: string | null): AuthenticatedUser {
  return {
    id: `${role}-id`,
    username: role,
    role,
    gateId,
    groups: [],
    menuAccess: getDefaultMenuAccessForRole(role),
    permissions: getDefaultPermissionsForRole(role)
  };
}

test("check-in only allows pre-registered visits", () => {
  assert.doesNotThrow(() => assertCanCheckIn(VISIT_STATUS.PRE_REGISTERED));
  assert.throws(() => assertCanCheckIn(VISIT_STATUS.CHECKED_IN));
  assert.throws(() => assertCanCheckIn(VISIT_STATUS.CHECKED_OUT));
});

test("approval gate blocks pending and rejected visits before check-in", () => {
  assert.doesNotThrow(() => assertVisitApprovedForCheckIn(APPROVAL_STATUS.APPROVED));
  assert.doesNotThrow(() => assertVisitApprovedForCheckIn(APPROVAL_STATUS.NOT_REQUIRED));
  assert.throws(() => assertVisitApprovedForCheckIn(APPROVAL_STATUS.PENDING));
  assert.throws(() => assertVisitApprovedForCheckIn(APPROVAL_STATUS.REJECTED));
});

test("check-out requires host signature confirmation", () => {
  assert.throws(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.PENDING }));
  assert.doesNotThrow(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY }));
  assert.throws(() => assertCanCheckOut(VISIT_STATUS.PRE_REGISTERED, { status: HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY }));
});

test("check-out requires signature date for signed_later", () => {
  assert.throws(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.SIGNED_LATER }));
  assert.doesNotThrow(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.SIGNED_LATER, signatureDate: "2026-05-22" }));
});

test("check-out requires note for missing exception", () => {
  assert.throws(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.MISSING_EXCEPTION }));
  assert.doesNotThrow(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.MISSING_EXCEPTION, note: "Ausnahme an Tor abgestimmt" }));
});

test("check-out requires matching returned badge number", () => {
  assert.doesNotThrow(() => assertReturnedBadgeNumberMatches("B-2026-000123", "B-2026-000123"));
  assert.doesNotThrow(() => assertReturnedBadgeNumberMatches("B-2026-000123", "  b-2026-000123  "));
  assert.throws(() => assertReturnedBadgeNumberMatches("B-2026-000123", "B-2026-000124"));
  assert.throws(() => assertReturnedBadgeNumberMatches("B-2026-000123", " "));
});

test("signature update only allows checked-in and checked-out visits", () => {
  assert.doesNotThrow(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_IN, { status: HOST_SIGNATURE_STATUS.PENDING }));
  assert.doesNotThrow(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_OUT, { status: HOST_SIGNATURE_STATUS.PENDING }));
  assert.throws(() => assertCanUpdateHostSignature(VISIT_STATUS.PRE_REGISTERED, { status: HOST_SIGNATURE_STATUS.PENDING }));
});

test("signature follow-up keeps signed_later and missing_exception strict", () => {
  assert.throws(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_OUT, { status: HOST_SIGNATURE_STATUS.SIGNED_LATER }));
  assert.doesNotThrow(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_OUT, { status: HOST_SIGNATURE_STATUS.SIGNED_LATER, signatureDate: "2026-05-22" }));
  assert.throws(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_OUT, { status: HOST_SIGNATURE_STATUS.MISSING_EXCEPTION }));
  assert.doesNotThrow(() => assertCanUpdateHostSignature(VISIT_STATUS.CHECKED_OUT, { status: HOST_SIGNATURE_STATUS.MISSING_EXCEPTION, note: "Begruendung vorhanden" }));
});

test("admin can access any assigned gate", () => {
  const admin = makeUser("admin", null);

  assert.equal(canAccessGate(admin, "gate-1"), true);
});

test("admin can update unassigned pre-registered visits in guard workflow", () => {
  const admin = makeUser("admin", null);

  assert.equal(
    canManageGuardScopedVisit(admin, { gateId: null, status: VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }),
    true
  );
});

test("guard can update unassigned pre-registered visits only with own gate context", () => {
  const guard = makeUser("guard", "gate-1");
  const guardWithoutGate: AuthenticatedUser = {
    ...guard,
    gateId: null
  };

  assert.equal(
    canManageGuardScopedVisit(guard, { gateId: null, status: VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }),
    true
  );
  assert.equal(
    canManageGuardScopedVisit(guardWithoutGate, { gateId: null, status: VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }),
    false
  );
});

test("guard users are restricted to their own gate", () => {
  const guard = makeUser("guard", "gate-1");

  assert.equal(canAccessGate(guard, "gate-1"), true);
  assert.equal(canAccessGate(guard, "gate-2"), false);
});

test("sibe has no implicit guard scope access", () => {
  const sibe = makeUser("sibe", null);

  assert.equal(canAccessGate(sibe, "gate-1"), false);
});

test("unassigned visits remain blocked when the workflow requires an assigned gate", () => {
  const admin = makeUser("admin", null);

  assert.equal(
    canManageGuardScopedVisit(admin, { gateId: null, status: VISIT_STATUS.PRE_REGISTERED }),
    false
  );
});

test("default menu access grants dedicated approval permission to sibe and admin", () => {
  assert.equal(getDefaultMenuAccessForRole("admin").includes("genehmigung"), true);
  assert.equal(getDefaultMenuAccessForRole("sibe").includes("genehmigung"), true);
  assert.equal(getDefaultMenuAccessForRole("guard").includes("genehmigung"), false);
  assert.equal(getDefaultMenuAccessForRole("kaskdt").includes("genehmigung"), false);
  assert.equal(getDefaultMenuAccessForRole("kaskdt").includes("import"), false);
  assert.equal(getDefaultMenuAccessForRole("kaskdt").includes("texte"), false);
});

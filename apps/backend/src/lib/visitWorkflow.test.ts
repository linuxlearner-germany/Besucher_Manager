import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanCheckIn,
  assertCanCheckOut,
  canAccessGate,
  HOST_SIGNATURE_STATUS,
  VISIT_STATUS,
  type AuthenticatedUser
} from "./visitWorkflow";

test("check-in only allows pre-registered visits", () => {
  assert.doesNotThrow(() => assertCanCheckIn(VISIT_STATUS.PRE_REGISTERED));
  assert.throws(() => assertCanCheckIn(VISIT_STATUS.CHECKED_IN));
  assert.throws(() => assertCanCheckIn(VISIT_STATUS.CHECKED_OUT));
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

test("guard users are restricted to their own gate", () => {
  const guard: AuthenticatedUser = {
    id: "1",
    username: "wache",
    role: "guard",
    gateId: "gate-1"
  };

  assert.equal(canAccessGate(guard, "gate-1"), true);
  assert.equal(canAccessGate(guard, "gate-2"), false);
});

test("admin can access all gates", () => {
  const admin: AuthenticatedUser = {
    id: "2",
    username: "admin",
    role: "admin",
    gateId: null
  };

  assert.equal(canAccessGate(admin, "gate-1"), true);
  assert.equal(canAccessGate(admin, "gate-2"), true);
});

test("sibe has no implicit guard scope access", () => {
  const sibe: AuthenticatedUser = {
    id: "3",
    username: "sibe",
    role: "sibe",
    gateId: null
  };

  assert.equal(canAccessGate(sibe, "gate-1"), false);
});

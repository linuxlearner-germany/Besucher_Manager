import test from "node:test";
import assert from "node:assert/strict";
import { assertCanCheckIn, assertCanCheckOut, canAccessGate, VISIT_STATUS, type AuthenticatedUser } from "./visitWorkflow";

test("check-in only allows pre-registered visits", () => {
  assert.doesNotThrow(() => assertCanCheckIn(VISIT_STATUS.PRE_REGISTERED));
  assert.throws(() => assertCanCheckIn(VISIT_STATUS.CHECKED_IN));
});

test("check-out requires host signature confirmation", () => {
  assert.throws(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, false));
  assert.doesNotThrow(() => assertCanCheckOut(VISIT_STATUS.CHECKED_IN, true));
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

import assert from "node:assert/strict";
import test from "node:test";
import { buildSimplifiedRequestNumber, deriveSimplifiedRequestStatus, generateSimplifiedRegistrationToken, hashSimplifiedRegistrationToken, verifySimplifiedRegistrationToken } from "./simplifiedRegistrationModel";

process.env.APP_SECRET ||= "simplified-registration-model-test-secret";

test("derives consistent request statuses", () => {
  assert.equal(deriveSimplifiedRequestStatus(["pending", "pending"]), "pending");
  assert.equal(deriveSimplifiedRequestStatus(["approved", "pending"]), "partially_approved");
  assert.equal(deriveSimplifiedRequestStatus(["approved", "approved"]), "approved");
  assert.equal(deriveSimplifiedRequestStatus(["rejected", "rejected"]), "rejected");
  assert.equal(deriveSimplifiedRequestStatus(["approved", "rejected"]), "completed");
  assert.equal(deriveSimplifiedRequestStatus(["revoked", "approved"]), "completed");
});

test("tokens are random, hashed and verifiable", () => {
  const first = generateSimplifiedRegistrationToken();
  const second = generateSimplifiedRegistrationToken();
  assert.notEqual(first, second);
  const hash = hashSimplifiedRegistrationToken(first);
  assert.equal(hash.length, 64);
  assert.equal(verifySimplifiedRegistrationToken(first, hash), true);
  assert.equal(verifySimplifiedRegistrationToken(second, hash), false);
});

test("request numbers contain year and padded sequence", () => {
  assert.equal(buildSimplifiedRequestNumber(123, new Date("2026-08-22T00:00:00Z")), "VM-2026-000123");
});

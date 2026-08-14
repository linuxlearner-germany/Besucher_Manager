import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_SECRET ||= "test-secret";
process.env.MSSQL_HOST ||= "localhost";
process.env.MSSQL_DATABASE ||= "testdb";
process.env.MSSQL_USER ||= "sa";
process.env.MSSQL_PASSWORD ||= "Password123!";

const {
  createPublicRecordVersion,
  generatePublicAccessToken,
  getGermanVisitDayEnd,
  getGermanVisitDayStart,
  getPublicEditMessage,
  hashPublicAccessToken,
  isPlausiblePublicAccessToken,
  publicPreRegistrationUpdateSchema
} = require("./publicPreRegistrationAccess") as typeof import("./publicPreRegistrationAccess");

test("public confirmation tokens have 256 bits of entropy and only their hash is persisted", () => {
  const first = generatePublicAccessToken();
  const second = generatePublicAccessToken();
  assert.equal(isPlausiblePublicAccessToken(first), true);
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.match(hashPublicAccessToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashPublicAccessToken(first).includes(first), false);
});

test("public update schema accepts tolerant optional contact values and empty fields", () => {
  const result = publicPreRegistrationUpdateSchema.safeParse({
    version: "a".repeat(64),
    firstName: " Erika ",
    phone: "+49 (0) 30-12 34 56",
    licensePlate: "B AB-123",
    email: ""
  });
  assert.equal(result.success, true);
});

test("public update schema rejects mass assignment of status, role, gate and internal comments", () => {
  for (const forbidden of ["status", "role", "gateId", "notes", "createdBy", "approvalStatus"]) {
    const result = publicPreRegistrationUpdateSchema.safeParse({ version: "a".repeat(64), firstName: "Erika", [forbidden]: "manipulated" });
    assert.equal(result.success, false, forbidden);
  }
});

test("public edit window closes at visit-day start, check-in, cancellation and rejection", () => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const base = { status: "pre_registered", checkInAt: null, validFrom: tomorrow, cancelledAt: null, rejectedAt: null };
  assert.equal(getPublicEditMessage(base), null);
  assert.match(getPublicEditMessage({ ...base, validFrom: new Date(Date.now() - 1) }) ?? "", /Besuchstags/);
  assert.match(getPublicEditMessage({ ...base, checkInAt: new Date() }) ?? "", /Check-in/);
  assert.match(getPublicEditMessage({ ...base, status: "cancelled", cancelledAt: new Date() }) ?? "", /widerrufen/);
  assert.match(getPublicEditMessage({ ...base, status: "rejected", rejectedAt: new Date() }) ?? "", /widerrufen/);
});

test("record version changes when either public record was concurrently updated", () => {
  const visit = new Date("2026-08-14T08:00:00.000Z");
  const visitor = new Date("2026-08-14T08:00:00.000Z");
  const version = createPublicRecordVersion(visit, visitor);
  assert.equal(version.length, 64);
  assert.notEqual(version, createPublicRecordVersion(new Date("2026-08-14T08:01:00.000Z"), visitor));
  assert.notEqual(version, createPublicRecordVersion(visit, new Date("2026-08-14T08:01:00.000Z")));
  assert.notEqual(
    createPublicRecordVersion("2026-08-14T08:00:00.1234567", "2026-08-14T08:00:00.0000000"),
    createPublicRecordVersion("2026-08-14T08:00:00.1234568", "2026-08-14T08:00:00.0000000")
  );
});

test("public validity follows the German calendar day across summer and winter time", () => {
  assert.equal(getGermanVisitDayStart(new Date("2026-08-14T00:00:00.000Z")).toISOString(), "2026-08-13T22:00:00.000Z");
  assert.equal(getGermanVisitDayEnd(new Date("2026-08-14T23:59:59.999Z")).toISOString(), "2026-08-14T21:59:59.999Z");
  assert.equal(getGermanVisitDayStart(new Date("2026-12-14T00:00:00.000Z")).toISOString(), "2026-12-13T23:00:00.000Z");
  assert.equal(getGermanVisitDayEnd(new Date("2026-12-14T23:59:59.999Z")).toISOString(), "2026-12-14T22:59:59.999Z");
  assert.equal(getGermanVisitDayStart(new Date("2026-03-29T00:00:00.000Z")).toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(getGermanVisitDayEnd(new Date("2026-03-29T23:59:59.999Z")).toISOString(), "2026-03-29T21:59:59.999Z");
  assert.equal(getGermanVisitDayStart(new Date("2026-10-25T00:00:00.000Z")).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(getGermanVisitDayEnd(new Date("2026-10-25T23:59:59.999Z")).toISOString(), "2026-10-25T22:59:59.999Z");
});

import test from "node:test";
import assert from "node:assert/strict";
import { publicPreRegistrationSchema } from "./publicPreRegistrationSchema";

test("public pre-registration requires validUntil after validFrom", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine@example.com",
    hostPhone: "0123",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    gateId: "11111111-1111-1111-1111-111111111111",
    validFrom: "2026-05-21T10:00:00.000Z",
    validUntil: "2026-05-21T09:00:00.000Z"
  });

  assert.equal(result.success, false);
});

test("public pre-registration accepts valid input", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine@example.com",
    hostPhone: "0123",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    gateId: "11111111-1111-1111-1111-111111111111",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    birthDate: "1990-01-15",
    email: "max@example.com"
  });

  assert.equal(result.success, true);
});

test("public pre-registration rejects invalid e-mail", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine@example.com",
    hostPhone: "0123",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    gateId: "11111111-1111-1111-1111-111111111111",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    email: "not-an-email"
  });

  assert.equal(result.success, false);
});

test("public pre-registration requires a gate and required visit fields", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostDepartment: "",
    purpose: "",
    gateId: "",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z"
  });

  assert.equal(result.success, false);
});

test("public pre-registration rejects future birth dates", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    gateId: "11111111-1111-1111-1111-111111111111",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    birthDate: "2999-01-01"
  });

  assert.equal(result.success, false);
});

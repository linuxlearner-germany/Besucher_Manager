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
    purpose: "Besprechung",
    validFrom: "2026-05-21T10:00:00.000Z",
    validUntil: "2026-05-21T09:00:00.000Z"
  });

  assert.equal(result.success, false);
});

test("public pre-registration accepts valid input", () => {
  const result = publicPreRegistrationSchema.safeParse({
    gateId: "5F5EA42B-69C9-43BF-BBB5-EEBF9D9E958B",
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine@example.com",
    hostPhone: "0123",
    hostDepartment: "",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    birthDate: "1990-01-15",
    email: "max@example.com"
  });

  assert.equal(result.success, true);
});

test("public pre-registration accepts optional gate id", () => {
  const result = publicPreRegistrationSchema.safeParse({
    gateId: "5F5EA42B-69C9-43BF-BBB5-EEBF9D9E958B",
    firstName: "Erika",
    lastName: "Beispiel",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z"
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
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    email: "not-an-email"
  });

  assert.equal(result.success, false);
});

test("public pre-registration validates required fields without requiring gate", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostPhone: "",
    hostDepartment: "",
    purpose: "",
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
    hostPhone: "0123",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    birthDate: "2999-01-01"
  });

  assert.equal(result.success, false);
});

test("public pre-registration allows empty department but requires host phone", () => {
  const withoutDepartment = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostPhone: "0123",
    hostDepartment: "",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z"
  });
  assert.equal(withoutDepartment.success, true);

  const withoutHostPhone = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostPhone: "",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z"
  });
  assert.equal(withoutHostPhone.success, false);
});

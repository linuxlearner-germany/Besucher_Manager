import test from "node:test";
import assert from "node:assert/strict";
import { createPublicPreRegistrationSchema, publicPreRegistrationSchema } from "./publicPreRegistrationSchema";

const idDocumentFields = {
  visitorStreet: "Musterstraße",
  visitorHouseNumber: "12",
  visitorPostalCode: "10115",
  visitorCity: "Berlin",
  nationalityCode: "DE",
  idDocumentType: "identity_card",
  idDocumentValidUntil: "2030-12-31",
  idDocumentNumber: "A1234567"
};

test("public pre-registration requires validUntil after validFrom", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine.keller@bundeswehr.org",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21T10:00:00.000Z",
    validUntil: "2026-05-21T09:00:00.000Z",
    ...idDocumentFields
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
    hostEmail: "sabine.keller@bundeswehr.org",
    hostPhone: "0123",
    hostDepartment: "",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    expectedArrivalTime: "08:30",
    birthDate: "1990-01-15",
    email: "max@example.com",
    ...idDocumentFields
  });

  assert.equal(result.success, true);
});

test("public pre-registration rejects an invalid expected arrival time", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine.keller@bundeswehr.org",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    expectedArrivalTime: "25:00",
    ...idDocumentFields
  });

  assert.equal(result.success, false);
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
    validUntil: "2026-05-21T10:00:00.000Z",
    ...idDocumentFields
  });

  assert.equal(result.success, true);
});

test("public pre-registration rejects invalid e-mail", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine.keller@bundeswehr.org",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    email: "not-an-email",
    ...idDocumentFields
  });

  assert.equal(result.success, false);
});

test("public pre-registration only accepts Bundeswehr address for the registrant", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostEmail: "sabine.keller@gmail.com",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21T08:00:00.000Z",
    validUntil: "2026-05-21T10:00:00.000Z",
    ...idDocumentFields
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
    validUntil: "2026-05-21T10:00:00.000Z",
    ...idDocumentFields
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
    birthDate: "2999-01-01",
    ...idDocumentFields
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
    validUntil: "2026-05-21T10:00:00.000Z",
    ...idDocumentFields
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
    validUntil: "2026-05-21T10:00:00.000Z",
    ...idDocumentFields
  });
  assert.equal(withoutHostPhone.success, false);
});

test("public pre-registration only requires fields selected by field configuration", () => {
  const schema = createPublicPreRegistrationSchema(new Set(["visitor_nationality"]));
  const result = schema.safeParse({ nationalityCode: "DE" });

  assert.equal(result.success, true);
});

test("public pre-registration requires the complete address by default", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostPhone: "0123",
    purpose: "Besprechung",
    validFrom: "2026-05-21",
    validUntil: "2026-05-21",
    ...idDocumentFields,
    visitorStreet: ""
  });

  assert.equal(result.success, false);
});

test("public pre-registration validates the complete structured address when configured", () => {
  const schema = createPublicPreRegistrationSchema(new Set([
    "visitor_street",
    "visitor_house_number",
    "visitor_postal_code",
    "visitor_city"
  ]));
  const complete = schema.safeParse({
    visitorStreet: "Musterstraße",
    visitorHouseNumber: "12a",
    visitorPostalCode: "10115",
    visitorCity: "Berlin"
  });
  const missingPostalCode = schema.safeParse({
    visitorStreet: "Musterstraße",
    visitorHouseNumber: "12a",
    visitorCity: "Berlin"
  });

  assert.equal(complete.success, true);
  assert.equal(missingPostalCode.success, false);
});

test("public pre-registration allows omitted nationality when it is not configured", () => {
  const schema = createPublicPreRegistrationSchema(new Set());
  const result = schema.safeParse({});

  assert.equal(result.success, true);
});

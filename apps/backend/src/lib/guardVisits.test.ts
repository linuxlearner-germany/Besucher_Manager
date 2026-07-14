import test from "node:test";
import assert from "node:assert/strict";

function createBaseVisit() {
  return {
    status: "pre_registered",
    firstName: "Max",
    lastName: "Mustermann",
    company: "Muster GmbH",
    hostName: "Erika Beispiel",
    hostPhone: "01234",
    purpose: "Besprechung",
    approvalStatus: "approved" as string,
    validFrom: "2026-05-26T08:00:00.000Z",
    validUntil: "2026-05-26T10:00:00.000Z",
    gateId: null as string | null,
    badgeNumber: "A7K9P",
    checkOutAt: null as string | null,
    birthDate: null as string | null,
    visitorPhone: null as string | null,
    visitorEmail: null as string | null,
    licensePlate: null as string | null,
    visitorStreet: "Musterweg" as string | null,
    visitorHouseNumber: "10" as string | null,
    visitorPostalCode: "12345" as string | null,
    visitorCity: "Berlin" as string | null,
    visitorAddress: null as string | null,
    idDocumentType: "identity_card" as string | null,
    idDocumentValidUntil: "2030-12-31" as string | null,
    idDocumentNumber: "A1234567" as string | null,
    idDocumentIssuingPlace: "Berlin" as string | null
  };
}

test("completeness detects missing host phone and blocks check-in", () => {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.hostPhone = "";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "Ansprechpartner Telefon"), true);
});

test("completeness detects missing purpose", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.purpose = " ";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "Besuchszweck"), true);
});

test("completeness detects invalid range", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.validFrom = "2026-05-26T12:00:00.000Z";
  visit.validUntil = "2026-05-26T10:00:00.000Z";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "valid_until"), true);
});

test("completeness accepts same-day date-only ranges", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.validFrom = "2026-05-26";
  visit.validUntil = "2026-05-26";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "valid_until"), false);
});

test("completeness allows check-in when required fields are present", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, true);
  assert.equal(completeness.warnings.some((issue: { field: string }) => issue.field === "gate_id"), false);
  assert.equal(completeness.infos.some((issue: { field: string }) => issue.field === "id_document"), false);
});

test("completeness accepts visitor_address free text as address alternative", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.visitorStreet = "";
  visit.visitorHouseNumber = "";
  visit.visitorPostalCode = "";
  visit.visitorCity = "";
  visit.visitorAddress = "Musterweg 10, 12345 Berlin";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, true);
});

test("completeness blocks check-in without address", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.visitorStreet = "";
  visit.visitorHouseNumber = "";
  visit.visitorPostalCode = "";
  visit.visitorCity = "";
  visit.visitorAddress = "";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "Straße"), true);
});

test("completeness blocks check-in without id document fields", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.idDocumentType = "";
  visit.idDocumentValidUntil = "";
  visit.idDocumentNumber = "";
  visit.idDocumentIssuingPlace = "";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "Ausweisnummer"), true);
  assert.equal(completeness.infos.some((issue: { field: string }) => issue.field === "id_document"), false);
});

test("completeness does not warn about missing gate assignment", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.gateId = null;
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.warnings.some((issue: { field: string }) => issue.field === "gate_id"), false);
});

test("completeness respects required fields from configuration", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.hostPhone = "";
  const config = {
    requiredGuardCheckin: [
      { fieldKey: "visitor_first_name", label: "Vorname" }
    ],
    requiredBeforePrint: [
      { fieldKey: "visitor_first_name", label: "Vorname" }
    ],
    optionalInfoGuard: []
  };
  const completeness = getVisitCompleteness(visit, config);
  assert.equal(completeness.canCheckIn, true);
  assert.equal(completeness.errors.some((issue: { field: string }) => issue.field === "Ansprechpartner Telefon"), false);
});

test("completeness blocks pending approvals before check-in", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.approvalStatus = "pending";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string; message: string }) => issue.field === "approval_status" && issue.message.includes("SiBe-Genehmigung")), true);
});

test("completeness blocks rejected approvals before check-in", () => {
  const { getVisitCompleteness } = require("./guardVisits");
  const visit = createBaseVisit();
  visit.approvalStatus = "rejected";
  const completeness = getVisitCompleteness(visit);
  assert.equal(completeness.canCheckIn, false);
  assert.equal(completeness.errors.some((issue: { field: string; message: string }) => issue.field === "approval_status" && issue.message.includes("abgelehnt")), true);
});

test("guard visitor search is allowed for guard and admin only", () => {
  const { canUseGuardVisitorSearch } = require("./guardVisits");
  const basePermissions = {
    visits: { create: true }
  };

  assert.equal(canUseGuardVisitorSearch({ role: "guard", permissions: basePermissions }), true);
  assert.equal(canUseGuardVisitorSearch({ role: "admin", permissions: basePermissions }), true);
  assert.equal(canUseGuardVisitorSearch({ role: "sibe", permissions: basePermissions }), false);
  assert.equal(canUseGuardVisitorSearch({ role: "guard", permissions: { visits: { create: false } } }), false);
});

test("guard visitor search ignores empty and too-short criteria", () => {
  const { hasGuardVisitorSearchCriteria } = require("./guardVisits");

  assert.equal(hasGuardVisitorSearchCriteria({ firstName: "", lastName: "" }), false);
  assert.equal(hasGuardVisitorSearchCriteria({ firstName: "A" }), false);
  assert.equal(hasGuardVisitorSearchCriteria({ badgeNumber: "Z" }), false);
  assert.equal(hasGuardVisitorSearchCriteria({ birthDate: "2026-07-14" }), true);
  assert.equal(hasGuardVisitorSearchCriteria({ firstName: "Al" }), true);
  assert.equal(hasGuardVisitorSearchCriteria({ email: "ab" }), true);
});

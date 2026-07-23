"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
function createBaseVisit() {
    return {
        status: "pre_registered",
        firstName: "Max",
        lastName: "Mustermann",
        company: "Muster GmbH",
        nationalityCode: "DE",
        hostName: "Erika Beispiel",
        hostPhone: "01234",
        purpose: "Besprechung",
        validFrom: "2026-05-26T08:00:00.000Z",
        validUntil: "2026-05-26T10:00:00.000Z",
        gateId: null,
        badgeNumber: "A7K9P",
        checkOutAt: null,
        birthDate: null,
        visitorPhone: null,
        visitorEmail: null,
        licensePlate: null,
        visitorStreet: "Musterweg",
        visitorHouseNumber: "10",
        visitorPostalCode: "12345",
        visitorCity: "Berlin",
        visitorAddress: null,
        idDocumentType: "identity_card",
        idDocumentValidUntil: "2030-12-31",
        idDocumentNumber: "A1234567",
        idDocumentIssuingPlace: "Berlin"
    };
}
(0, node_test_1.default)("completeness detects missing host phone and blocks check-in", () => {
    process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
    process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
    process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
    process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
    process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.hostPhone = "";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Ansprechpartner Telefon"), true);
});
(0, node_test_1.default)("completeness detects missing purpose", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.purpose = " ";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Besuchszweck"), true);
});
(0, node_test_1.default)("completeness detects invalid range", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.validFrom = "2026-05-26T12:00:00.000Z";
    visit.validUntil = "2026-05-26T10:00:00.000Z";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "valid_until"), true);
});
(0, node_test_1.default)("completeness accepts same-day date-only ranges", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.validFrom = "2026-05-26";
    visit.validUntil = "2026-05-26";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "valid_until"), false);
});
(0, node_test_1.default)("completeness allows check-in when required fields are present", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, true);
    strict_1.default.equal(completeness.warnings.some((issue) => issue.field === "gate_id"), false);
    strict_1.default.equal(completeness.infos.some((issue) => issue.field === "id_document"), false);
});
(0, node_test_1.default)("completeness accepts visitor_address free text as address alternative", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.visitorStreet = "";
    visit.visitorHouseNumber = "";
    visit.visitorPostalCode = "";
    visit.visitorCity = "";
    visit.visitorAddress = "Musterweg 10, 12345 Berlin";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, true);
});
(0, node_test_1.default)("completeness blocks check-in without address", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.visitorStreet = "";
    visit.visitorHouseNumber = "";
    visit.visitorPostalCode = "";
    visit.visitorCity = "";
    visit.visitorAddress = "";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Straße"), true);
});
(0, node_test_1.default)("completeness blocks check-in without id document fields", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.idDocumentType = "";
    visit.idDocumentValidUntil = "";
    visit.idDocumentNumber = "";
    visit.idDocumentIssuingPlace = "";
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Ausweisnummer"), true);
    strict_1.default.equal(completeness.infos.some((issue) => issue.field === "id_document"), false);
});
(0, node_test_1.default)("completeness does not warn about missing gate assignment", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.gateId = null;
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.warnings.some((issue) => issue.field === "gate_id"), false);
});
(0, node_test_1.default)("completeness respects required fields from configuration", () => {
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
    strict_1.default.equal(completeness.canCheckIn, true);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Ansprechpartner Telefon"), false);
});
(0, node_test_1.default)("completeness blocks missing nationality", () => {
    const { getVisitCompleteness } = require("./guardVisits");
    const visit = createBaseVisit();
    visit.nationalityCode = null;
    const completeness = getVisitCompleteness(visit);
    strict_1.default.equal(completeness.canCheckIn, false);
    strict_1.default.equal(completeness.errors.some((issue) => issue.field === "Nationalität"), true);
});

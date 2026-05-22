"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const publicPreRegistrationSchema_1 = require("./publicPreRegistrationSchema");
(0, node_test_1.default)("public pre-registration requires validUntil after validFrom", () => {
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse({
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
    strict_1.default.equal(result.success, false);
});
(0, node_test_1.default)("public pre-registration accepts valid input", () => {
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse({
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
    strict_1.default.equal(result.success, true);
});
(0, node_test_1.default)("public pre-registration rejects invalid e-mail", () => {
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse({
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
    strict_1.default.equal(result.success, false);
});
(0, node_test_1.default)("public pre-registration requires a gate and required visit fields", () => {
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse({
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
    strict_1.default.equal(result.success, false);
});
(0, node_test_1.default)("public pre-registration rejects future birth dates", () => {
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse({
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
    strict_1.default.equal(result.success, false);
});

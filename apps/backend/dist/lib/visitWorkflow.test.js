"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const visitWorkflow_1 = require("./visitWorkflow");
function makeUser(role, gateId) {
    return {
        id: `${role}-id`,
        username: role,
        role,
        gateId,
        groups: [],
        menuAccess: (0, visitWorkflow_1.getDefaultMenuAccessForRole)(role),
        permissions: (0, visitWorkflow_1.getDefaultPermissionsForRole)(role)
    };
}
(0, node_test_1.default)("check-in only allows pre-registered visits", () => {
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanCheckIn)(visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckIn)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckIn)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT));
});
(0, node_test_1.default)("check-out requires host signature confirmation", () => {
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING }));
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY }));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY }));
});
(0, node_test_1.default)("check-out blocks any missing or deferred host confirmation", () => {
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER }));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION }));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanCheckOut)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.NOT_REQUIRED }));
});
(0, node_test_1.default)("check-out requires matching returned badge number", () => {
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertReturnedBadgeNumberMatches)("B-2026-000123", "B-2026-000123"));
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertReturnedBadgeNumberMatches)("B-2026-000123", "  b-2026-000123  "));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertReturnedBadgeNumberMatches)("B-2026-000123", "B-2026-000124"));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertReturnedBadgeNumberMatches)("B-2026-000123", " "));
});
(0, node_test_1.default)("signature update only allows checked-in and checked-out visits", () => {
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_IN, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING }));
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING }));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING }));
});
(0, node_test_1.default)("signature follow-up keeps signed_later and missing_exception strict", () => {
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER }));
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER, signatureDate: "2026-05-22" }));
    strict_1.default.throws(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION }));
    strict_1.default.doesNotThrow(() => (0, visitWorkflow_1.assertCanUpdateHostSignature)(visitWorkflow_1.VISIT_STATUS.CHECKED_OUT, { status: visitWorkflow_1.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION, note: "Begruendung vorhanden" }));
});
(0, node_test_1.default)("admin can access any assigned gate", () => {
    const admin = makeUser("admin", null);
    strict_1.default.equal((0, visitWorkflow_1.canAccessGate)(admin, "gate-1"), true);
});
(0, node_test_1.default)("admin can update unassigned pre-registered visits in guard workflow", () => {
    const admin = makeUser("admin", null);
    strict_1.default.equal((0, visitWorkflow_1.canManageGuardScopedVisit)(admin, { gateId: null, status: visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }), true);
});
(0, node_test_1.default)("guard can update unassigned pre-registered visits only with own gate context", () => {
    const guard = makeUser("guard", "gate-1");
    const guardWithoutGate = {
        ...guard,
        gateId: null
    };
    strict_1.default.equal((0, visitWorkflow_1.canManageGuardScopedVisit)(guard, { gateId: null, status: visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }), true);
    strict_1.default.equal((0, visitWorkflow_1.canManageGuardScopedVisit)(guardWithoutGate, { gateId: null, status: visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED }, { allowUnassignedPreRegistered: true }), false);
});
(0, node_test_1.default)("guard users are restricted to their own gate", () => {
    const guard = makeUser("guard", "gate-1");
    strict_1.default.equal((0, visitWorkflow_1.canAccessGate)(guard, "gate-1"), true);
    strict_1.default.equal((0, visitWorkflow_1.canAccessGate)(guard, "gate-2"), false);
});
(0, node_test_1.default)("sibe has no implicit guard scope access", () => {
    const sibe = makeUser("sibe", null);
    strict_1.default.equal((0, visitWorkflow_1.canAccessGate)(sibe, "gate-1"), false);
});
(0, node_test_1.default)("unassigned visits remain blocked when the workflow requires an assigned gate", () => {
    const admin = makeUser("admin", null);
    strict_1.default.equal((0, visitWorkflow_1.canManageGuardScopedVisit)(admin, { gateId: null, status: visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED }), false);
});
(0, node_test_1.default)("default menu access gives KasKdt text management without import", () => {
    strict_1.default.equal((0, visitWorkflow_1.getDefaultMenuAccessForRole)("kaskdt").includes("import"), false);
    strict_1.default.equal((0, visitWorkflow_1.getDefaultMenuAccessForRole)("kaskdt").includes("texte"), true);
    strict_1.default.equal((0, visitWorkflow_1.getDefaultPermissionsForRole)("kaskdt").texts.manage, true);
});

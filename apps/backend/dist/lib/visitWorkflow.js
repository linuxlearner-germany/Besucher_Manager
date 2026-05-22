"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOST_SIGNATURE_STATUS = exports.VISIT_STATUS = void 0;
exports.normalizeVisitStatus = normalizeVisitStatus;
exports.assertCanCheckIn = assertCanCheckIn;
exports.assertCanCheckOut = assertCanCheckOut;
exports.canAccessGate = canAccessGate;
exports.VISIT_STATUS = {
    PRE_REGISTERED: "pre_registered",
    CHECKED_IN: "checked_in",
    CHECKED_OUT: "checked_out",
    CANCELLED: "cancelled"
};
exports.HOST_SIGNATURE_STATUS = {
    NOT_REQUIRED: "not_required",
    PENDING: "pending",
    SIGNED_SAME_DAY: "signed_same_day",
    SIGNED_LATER: "signed_later",
    MISSING_EXCEPTION: "missing_exception"
};
function normalizeVisitStatus(status) {
    switch (status) {
        case "vorangemeldet":
            return exports.VISIT_STATUS.PRE_REGISTERED;
        case "eingecheckt":
            return exports.VISIT_STATUS.CHECKED_IN;
        case "ausgecheckt":
            return exports.VISIT_STATUS.CHECKED_OUT;
        default:
            return status;
    }
}
function assertCanCheckIn(status) {
    const normalized = normalizeVisitStatus(status);
    if (normalized !== exports.VISIT_STATUS.PRE_REGISTERED) {
        throw new Error("invalid_check_in_status");
    }
}
function assertCanCheckOut(status, signature) {
    const normalized = normalizeVisitStatus(status);
    if (normalized !== exports.VISIT_STATUS.CHECKED_IN) {
        throw new Error("invalid_check_out_status");
    }
    if (signature.status === exports.HOST_SIGNATURE_STATUS.PENDING) {
        throw new Error("host_signature_required");
    }
    if (signature.status === exports.HOST_SIGNATURE_STATUS.SIGNED_LATER && !signature.signatureDate) {
        throw new Error("host_signature_date_required");
    }
    if (signature.status === exports.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !signature.note?.trim()) {
        throw new Error("host_signature_note_required");
    }
}
function canAccessGate(user, gateId) {
    if (user.role === "admin") {
        return true;
    }
    return Boolean(user.gateId && user.gateId === gateId);
}

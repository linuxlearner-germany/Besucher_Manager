"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_PERMISSION_KEYS = exports.APP_MENU_KEYS = exports.HOST_SIGNATURE_STATUS = exports.VISIT_STATUS = void 0;
exports.getDefaultMenuAccessForRole = getDefaultMenuAccessForRole;
exports.getAllowedMenuAccessForRole = getAllowedMenuAccessForRole;
exports.getDefaultPermissionsForRole = getDefaultPermissionsForRole;
exports.normalizeUserPermissions = normalizeUserPermissions;
exports.parsePermissionsJson = parsePermissionsJson;
exports.hasPermission = hasPermission;
exports.normalizeVisitStatus = normalizeVisitStatus;
exports.assertCanCheckIn = assertCanCheckIn;
exports.assertCanCheckOut = assertCanCheckOut;
exports.assertReturnedBadgeNumberMatches = assertReturnedBadgeNumberMatches;
exports.assertCanUpdateHostSignature = assertCanUpdateHostSignature;
exports.canAccessGate = canAccessGate;
exports.canManageGuardScopedVisit = canManageGuardScopedVisit;
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
exports.APP_MENU_KEYS = ["voranmeldung", "wache", "import", "admin", "sibe", "kaskdt", "texte"];
exports.APP_PERMISSION_KEYS = [
    "menu.guard",
    "visits.read",
    "visits.create",
    "visits.update",
    "visits.delete",
    "visits.checkIn",
    "visits.checkOut",
    "visits.printBadge",
    "imports.execute",
    "texts.manage",
    "dashboards.sibe",
    "dashboards.commander",
    "admin.users",
    "admin.guards",
    "admin.map",
    "admin.fields",
    "admin.system",
    "logs.audit",
    "logs.errors"
];
function createEmptyPermissions() {
    return {
        menu: {
            preRegistration: false,
            guard: false,
            import: false,
            admin: false,
            sibe: false,
            commander: false,
            texts: false
        },
        visits: {
            read: false,
            create: false,
            update: false,
            delete: false,
            checkIn: false,
            checkOut: false,
            printBadge: false
        },
        imports: {
            execute: false
        },
        texts: { manage: false },
        dashboards: {
            sibe: false,
            commander: false
        },
        admin: {
            users: false,
            guards: false,
            map: false,
            fields: false,
            system: false
        },
        logs: {
            audit: false,
            errors: false
        }
    };
}
function withAllPermissions() {
    return {
        menu: {
            preRegistration: true,
            guard: true,
            import: true,
            admin: true,
            sibe: true,
            commander: true,
            texts: true
        },
        visits: {
            read: true,
            create: true,
            update: true,
            delete: true,
            checkIn: true,
            checkOut: true,
            printBadge: true
        },
        imports: {
            execute: true
        },
        texts: { manage: true },
        dashboards: {
            sibe: true,
            commander: true
        },
        admin: {
            users: true,
            guards: true,
            map: true,
            fields: true,
            system: true
        },
        logs: {
            audit: true,
            errors: true
        }
    };
}
function mergePermissions(base, override) {
    if (!override) {
        return base;
    }
    return {
        menu: { ...base.menu, ...(override.menu ?? {}) },
        visits: { ...base.visits, ...(override.visits ?? {}) },
        imports: { ...base.imports, ...(override.imports ?? {}) },
        texts: { ...base.texts, ...(override.texts ?? {}) },
        dashboards: { ...base.dashboards, ...(override.dashboards ?? {}) },
        admin: { ...base.admin, ...(override.admin ?? {}) },
        logs: { ...base.logs, ...(override.logs ?? {}) }
    };
}
const defaultMenuAccessByRole = {
    admin: [...exports.APP_MENU_KEYS],
    guard: ["voranmeldung", "wache", "import"],
    sibe: ["sibe", "import"],
    kaskdt: ["kaskdt", "texte"],
    custom: []
};
const allowedMenuAccessByRole = {
    admin: [...exports.APP_MENU_KEYS],
    guard: ["voranmeldung", "wache", "import"],
    sibe: ["import", "sibe"],
    kaskdt: ["kaskdt", "texte"],
    custom: [...exports.APP_MENU_KEYS]
};
function getDefaultMenuAccessForRole(role) {
    return [...defaultMenuAccessByRole[role]];
}
function getAllowedMenuAccessForRole(role) {
    return [...allowedMenuAccessByRole[role]];
}
function getDefaultPermissionsForRole(role) {
    switch (role) {
        case "admin":
            return withAllPermissions();
        case "guard":
            return mergePermissions(createEmptyPermissions(), {
                menu: {
                    preRegistration: true,
                    guard: true,
                    import: true,
                    admin: false,
                    sibe: false,
                    commander: false,
                    texts: false
                },
                visits: {
                    read: true,
                    create: true,
                    update: true,
                    delete: false,
                    checkIn: true,
                    checkOut: true,
                    printBadge: true
                },
                imports: {
                    execute: true
                }
            });
        case "sibe":
            return mergePermissions(createEmptyPermissions(), {
                menu: {
                    preRegistration: false,
                    guard: false,
                    import: true,
                    sibe: true,
                    admin: false,
                    commander: false,
                    texts: false
                },
                visits: {
                    read: true,
                    create: true,
                    update: true,
                    delete: false,
                    checkIn: false,
                    checkOut: false,
                    printBadge: false
                },
                imports: {
                    execute: true
                },
                dashboards: {
                    sibe: true,
                    commander: false
                }
            });
        case "kaskdt":
            return mergePermissions(createEmptyPermissions(), {
                menu: {
                    preRegistration: false,
                    guard: false,
                    import: false,
                    admin: false,
                    sibe: false,
                    commander: true,
                    texts: true
                },
                visits: {
                    read: true,
                    create: false,
                    update: false,
                    delete: false,
                    checkIn: false,
                    checkOut: false,
                    printBadge: false
                },
                texts: { manage: true },
                dashboards: {
                    sibe: false,
                    commander: true
                }
            });
        case "custom":
            return createEmptyPermissions();
    }
}
function normalizeUserPermissions(role, permissions, menuAccess) {
    const normalized = role === "custom"
        ? mergePermissions(createEmptyPermissions(), permissions)
        : getDefaultPermissionsForRole(role);
    const nextMenuAccess = menuAccess ?? getDefaultMenuAccessForRole(role);
    normalized.menu.preRegistration = nextMenuAccess.includes("voranmeldung");
    normalized.menu.guard = nextMenuAccess.includes("wache");
    normalized.menu.import = nextMenuAccess.includes("import");
    normalized.menu.admin = nextMenuAccess.includes("admin");
    normalized.menu.sibe = nextMenuAccess.includes("sibe");
    normalized.menu.commander = nextMenuAccess.includes("kaskdt");
    normalized.menu.texts = nextMenuAccess.includes("texte");
    return normalized;
}
function parsePermissionsJson(value) {
    if (!value?.trim()) {
        return null;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function readPermissionValue(permissions, permission) {
    const [section, key] = permission.split(".");
    const sectionValue = permissions[section];
    return Boolean(sectionValue[key]);
}
function hasPermission(user, permission) {
    if (user.role === "admin") {
        return true;
    }
    return readPermissionValue(user.permissions, permission);
}
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
    if (signature.status !== exports.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY) {
        throw new Error("host_signature_checkout_required");
    }
}
function assertReturnedBadgeNumberMatches(expectedBadgeNumber, returnedBadgeNumber) {
    const expected = expectedBadgeNumber.trim().toUpperCase();
    const returned = returnedBadgeNumber.trim().toUpperCase();
    if (!expected || !returned || expected !== returned) {
        throw new Error("returned_badge_number_mismatch");
    }
}
function assertCanUpdateHostSignature(status, signature) {
    const normalized = normalizeVisitStatus(status);
    if (normalized !== exports.VISIT_STATUS.CHECKED_IN && normalized !== exports.VISIT_STATUS.CHECKED_OUT) {
        throw new Error("invalid_signature_update_status");
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
function canManageGuardScopedVisit(user, visit, options) {
    if (visit.gateId) {
        return canAccessGate(user, visit.gateId);
    }
    if (!options?.allowUnassignedPreRegistered) {
        return false;
    }
    const normalizedStatus = normalizeVisitStatus(visit.status);
    if (normalizedStatus !== exports.VISIT_STATUS.PRE_REGISTERED) {
        return false;
    }
    if (user.role === "admin") {
        return true;
    }
    return hasPermission(user, "visits.read") && Boolean(user.gateId);
}

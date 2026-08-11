"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const countries_1 = require("../lib/countries");
const env_1 = require("../config/env");
const authSession_1 = require("../lib/authSession");
const publicPreRegistrations_1 = require("../lib/publicPreRegistrations");
const publicPreRegistrationSchema_1 = require("../lib/publicPreRegistrationSchema");
const fieldDefinitions_1 = require("../lib/fieldDefinitions");
const rateLimit_1 = require("../lib/rateLimit");
const users_1 = require("../lib/users");
const visitImport_1 = require("../lib/visitImport");
const systemSettings_1 = require("../lib/systemSettings");
const appVersion_1 = require("../lib/appVersion");
const shared_1 = require("./shared");
const auditLog_1 = require("../lib/auditLog");
const db_1 = require("../lib/db");
const mssql_1 = __importDefault(require("mssql"));
const visitorImport_1 = require("./visitorImport");
const admin_1 = require("./admin");
const guard_1 = require("./guard");
const sibe_1 = require("./sibe");
const emailPolicy_1 = require("../lib/emailPolicy");
const mailRelay_1 = require("../lib/mailRelay");
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1),
    password: zod_1.z.string().min(1),
    gateId: zod_1.z.string().uuid().optional().or(zod_1.z.literal(""))
});
const passwordChangeSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(128),
    confirmPassword: zod_1.z.string().min(1)
}).superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["confirmPassword"],
            message: "Die Passwortbestätigung stimmt nicht überein."
        });
    }
    if (value.currentPassword === value.newPassword) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["newPassword"],
            message: "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden."
        });
    }
});
const publicGroupPreRegistrationSchema = zod_1.z.object({
    gateId: zod_1.z.string().uuid("Bitte eine Wache auswählen."),
    hostName: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    hostEmail: emailPolicy_1.bundeswehrEmailSchema,
    hostPhone: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    hostDepartment: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    purpose: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    validFrom: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    validUntil: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    notes: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    visitors: zod_1.z.array(zod_1.z.object({
        firstName: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        lastName: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        company: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        nationalityCode: zod_1.z.string().trim().transform((value, context) => {
            const code = (0, countries_1.normalizeCountryCode)(value);
            if (!code) {
                context.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
                return zod_1.z.NEVER;
            }
            return code;
        }),
        birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        visitorStreet: zod_1.z.string().trim().max(255).optional().or(zod_1.z.literal("")),
        visitorHouseNumber: zod_1.z.string().trim().max(40).optional().or(zod_1.z.literal("")),
        visitorPostalCode: zod_1.z.string().trim().max(20).optional().or(zod_1.z.literal("")),
        visitorCity: zod_1.z.string().trim().max(120).optional().or(zod_1.z.literal("")),
        phone: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        email: zod_1.z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
        licensePlate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        idDocumentType: zod_1.z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(zod_1.z.literal("")),
        idDocumentValidUntil: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        idDocumentNumber: zod_1.z.string().trim().optional().or(zod_1.z.literal(""))
    })).min(1).max(50)
});
const publicGroupSharedFieldMap = {
    host_name: "hostName",
    host_email: "hostEmail",
    host_phone: "hostPhone",
    host_department: "hostDepartment",
    visit_purpose: "purpose",
    valid_from: "validFrom",
    valid_until: "validUntil",
    visit_note: "notes"
};
const publicGroupVisitorFieldMap = {
    visitor_first_name: "firstName",
    visitor_last_name: "lastName",
    visitor_company: "company",
    visitor_street: "visitorStreet",
    visitor_house_number: "visitorHouseNumber",
    visitor_postal_code: "visitorPostalCode",
    visitor_city: "visitorCity",
    visitor_nationality: "nationalityCode",
    visitor_birth_date: "birthDate",
    visitor_phone: "phone",
    visitor_email: "email",
    visitor_license_plate: "licensePlate",
    id_document_type: "idDocumentType",
    id_document_valid_until: "idDocumentValidUntil",
    id_document_number: "idDocumentNumber"
};
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.get("/api/meta", (_request, response) => {
    response.json({
        version: appVersion_1.APP_VERSION,
        modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
        status: "active"
    });
});
exports.apiRouter.get("/api/countries", (_request, response) => {
    response.json({ countries: countries_1.COUNTRIES });
});
exports.apiRouter.get("/api/ui-settings", async (_request, response) => {
    try {
        const settings = await (0, systemSettings_1.loadWorkflowSettings)();
        return response.json({
            backgroundMode: settings.backgroundMode,
            backgroundImageUrl: settings.backgroundImageUrl,
            securityNumber: settings.securityNumber
        });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Die Oberflaecheneinstellungen konnten nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/auth/me", async (request, response) => {
    const user = await (0, shared_1.resolveAuthenticatedUser)(request);
    if (!user) {
        return response.json({
            user: null
        });
    }
    return response.json({
        user
    });
});
exports.apiRouter.post("/api/auth/login", async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
        return (0, shared_1.sendValidationError)(response, parsed.error.flatten());
    }
    try {
        const candidate = await (0, users_1.findUserForLogin)(parsed.data.username);
        if (!candidate || !candidate.isActive) {
            return response.status(401).json({
                error: "INVALID_CREDENTIALS",
                message: "Benutzername oder Passwort ist ungueltig."
            });
        }
        const passwordMatches = await (0, users_1.verifyPassword)(parsed.data.password, candidate.passwordHash);
        if (!passwordMatches) {
            return response.status(401).json({
                error: "INVALID_CREDENTIALS",
                message: "Benutzername oder Passwort ist ungueltig."
            });
        }
        let activeGateId = candidate.gateId;
        let activeGateName = null;
        if (candidate.role === "guard") {
            const requestedGateId = parsed.data.gateId?.trim() || "";
            if (!requestedGateId) {
                const gates = await (0, publicPreRegistrations_1.listActiveGates)();
                return response.json({
                    requiresGateSelection: true,
                    gates
                });
            }
            const selectedGate = await (0, publicPreRegistrations_1.findActiveGateById)(requestedGateId);
            if (!selectedGate) {
                return response.status(400).json({
                    error: "INVALID_GATE",
                    message: "Die ausgewaehlte Wache ist nicht verfuegbar."
                });
            }
            activeGateId = selectedGate.id;
            activeGateName = selectedGate.name;
        }
        else if (candidate.gateId) {
            const gate = await (0, publicPreRegistrations_1.findActiveGateById)(candidate.gateId);
            activeGateName = gate?.name ?? null;
        }
        const redirectTo = candidate.role === "admin"
            ? "/admin"
            : candidate.role === "guard"
                ? "/wache"
                : candidate.role === "kaskdt"
                    ? "/kaskdt"
                    : "/sibe";
        (0, authSession_1.setSessionCookie)(response, {
            id: candidate.id,
            username: candidate.username,
            role: candidate.role,
            gateId: activeGateId
        });
        const fullUser = await (0, users_1.findUserById)(candidate.id);
        const menuAccess = fullUser?.menuAccess ?? [];
        const redirectTarget = menuAccess.includes("admin")
            ? "/admin"
            : menuAccess.includes("wache")
                ? "/wache"
                : menuAccess.includes("sibe")
                    ? "/sibe"
                    : menuAccess.includes("kaskdt")
                        ? "/kaskdt"
                        : "/";
        return response.json({
            user: {
                id: candidate.id,
                username: candidate.username,
                displayName: candidate.username,
                role: candidate.role,
                gateId: activeGateId,
                gateName: activeGateName,
                groups: fullUser?.groups ?? [],
                menuAccess
            },
            redirectTo: redirectTarget || redirectTo
        });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Anmeldung fehlgeschlagen.");
    }
});
exports.apiRouter.post("/api/public/pre-registrations/group", async (request, response) => {
    const rateLimitKey = `public-group-pre-registration:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const rateLimitDecision = (0, rateLimit_1.checkRateLimit)(rateLimitKey, 8, 60);
    if (!rateLimitDecision.allowed) {
        response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
        return response.status(429).json({
            error: "RATE_LIMITED",
            message: "Zu viele Gruppenimporte. Bitte spaeter erneut versuchen."
        });
    }
    const parsed = publicGroupPreRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
        return (0, shared_1.sendValidationError)(response, parsed.error.flatten());
    }
    try {
        const gateId = parsed.data.gateId?.trim();
        if (!gateId) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { gateId: ["Bitte eine Wache auswählen."] } });
        }
        const gate = await (0, publicPreRegistrations_1.findActiveGateById)(gateId);
        if (!gate) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { gateId: ["Die ausgewählte Wache ist nicht verfügbar."] } });
        }
        const definitions = await (0, fieldDefinitions_1.listFieldDefinitions)("public");
        const requiredDefinitions = definitions.filter((field) => field.requiredPublic);
        const supportedKeys = new Set(Object.keys(publicPreRegistrationSchema_1.PUBLIC_FIELD_INPUT_MAP));
        const requiredPublicFieldKeys = new Set(requiredDefinitions
            .filter((field) => supportedKeys.has(field.fieldKey))
            .map((field) => field.fieldKey));
        const missingFields = [];
        for (const field of requiredDefinitions) {
            const sharedInput = publicGroupSharedFieldMap[field.fieldKey];
            if (sharedInput && !String(parsed.data[sharedInput] ?? "").trim()) {
                missingFields.push(`${field.label} fehlt.`);
            }
            const visitorInput = publicGroupVisitorFieldMap[field.fieldKey];
            if (visitorInput) {
                parsed.data.visitors.forEach((visitor, index) => {
                    if (!String(visitor[visitorInput] ?? "").trim()) {
                        missingFields.push(`Zeile ${index + 1}: ${field.label} fehlt.`);
                    }
                });
            }
        }
        if (missingFields.length > 0) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { visitors: missingFields } });
        }
        const created = await (0, visitImport_1.createImportedPreRegistrations)(parsed.data.visitors.map((visitor) => ({
            ...visitor,
            gateId: parsed.data.gateId,
            hostName: parsed.data.hostName,
            hostEmail: parsed.data.hostEmail,
            hostPhone: parsed.data.hostPhone,
            hostDepartment: parsed.data.hostDepartment,
            purpose: parsed.data.purpose,
            validFrom: parsed.data.validFrom,
            validUntil: parsed.data.validUntil,
            notes: parsed.data.notes
        })), {
            source: "public_group_form",
            submittedIpAddress: request.ip || request.socket.remoteAddress || null,
            userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
            fallbackGateId: parsed.data.gateId,
            requiredPublicFieldKeys
        });
        if (parsed.data.hostEmail) {
            void (0, mailRelay_1.sendGroupPreRegistrationConfirmation)({
                to: parsed.data.hostEmail,
                visitorCount: created.imported,
                validFrom: parsed.data.validFrom || "-",
                validUntil: parsed.data.validUntil || "-",
                purpose: parsed.data.purpose || ""
            }).catch(() => undefined);
        }
        return response.status(201).json({
            message: `${created.imported} Besucher wurden als Voranmeldung gespeichert.`,
            ...created
        });
    }
    catch (error) {
        if (error instanceof visitImport_1.ImportValidationError) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { visitors: error.messages } });
        }
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Der Gruppenimport konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.post("/api/public/visits/import", async (request, response) => {
    const rateLimitKey = `public-visitor-import:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const rateLimitDecision = (0, rateLimit_1.checkRateLimit)(rateLimitKey, 8, 60);
    if (!rateLimitDecision.allowed) {
        response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
        return response.status(429).json({
            error: "RATE_LIMITED",
            message: "Zu viele Importversuche. Bitte spaeter erneut versuchen."
        });
    }
    return (0, visitorImport_1.handleVisitorImportUpload)(request, response, {
        createdBy: null,
        fallbackGateId: null
    });
});
exports.apiRouter.get("/api/public/visits/import-template.xlsx", async (_request, response) => {
    return (0, visitorImport_1.sendVisitorImportTemplateWorkbook)(response);
});
exports.apiRouter.post("/api/auth/logout", async (_request, response) => {
    (0, authSession_1.clearSessionCookie)(response);
    response.json({ success: true });
});
exports.apiRouter.put("/api/auth/password", async (request, response) => {
    const user = await (0, shared_1.requireAuthenticatedUser)(request, response);
    if (!user)
        return;
    const rateLimitDecision = (0, rateLimit_1.checkRateLimit)(`password-change:${user.id}`, 5, 300);
    if (!rateLimitDecision.allowed) {
        response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
        return (0, shared_1.sendError)(response, 429, "RATE_LIMITED", "Zu viele Passwortänderungsversuche. Bitte warten Sie einige Minuten.");
    }
    const parsed = passwordChangeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
        return (0, shared_1.sendValidationError)(response, parsed.error.flatten());
    }
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        SELECT password_hash AS passwordHash, is_active AS isActive
        FROM dbo.users
        WHERE id = @id
      `);
        const account = result.recordset[0];
        if (!account?.isActive || !(await (0, users_1.verifyPassword)(parsed.data.currentPassword, account.passwordHash))) {
            return (0, shared_1.sendError)(response, 400, "CURRENT_PASSWORD_INVALID", "Das aktuelle Passwort ist nicht korrekt.");
        }
        const passwordHash = await (0, users_1.hashPassword)(parsed.data.newPassword);
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, user.id)
            .input("passwordHash", mssql_1.default.NVarChar(255), passwordHash)
            .query("UPDATE dbo.users SET password_hash = @passwordHash, updated_at = SYSUTCDATETIME() WHERE id = @id");
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "USER_PASSWORD_CHANGED",
            objectType: "user",
            objectId: user.id,
            ipAddress: (0, shared_1.getRequestIp)(request),
            userAgent: (0, shared_1.getRequestUserAgent)(request)
        });
        return response.json({ success: true });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Das Passwort konnte nicht geändert werden.");
    }
});
exports.apiRouter.get("/api/public/gates", async (_request, response) => {
    try {
        const [gates, csrfToken] = await Promise.all([
            (0, publicPreRegistrations_1.listActiveGates)(),
            (0, shared_1.issueCsrfToken)(response)
        ]);
        response.json({
            gates,
            csrfToken
        });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Wachen konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/public/pre-registrations", async (request, response) => {
    const rateLimitKey = `public-pre-registration:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const rateLimitDecision = (0, rateLimit_1.checkRateLimit)(rateLimitKey, env_1.env.PUBLIC_FORM_RATE_LIMIT, env_1.env.PUBLIC_FORM_RATE_WINDOW_SECONDS);
    if (!rateLimitDecision.allowed) {
        response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
        return response.status(429).json({
            error: "RATE_LIMITED",
            message: `Zu viele Anfragen. Bitte in ${rateLimitDecision.retryAfterSeconds} Sekunden erneut versuchen.`,
            retryAfterSeconds: rateLimitDecision.retryAfterSeconds
        });
    }
    try {
        const definitions = await (0, fieldDefinitions_1.listFieldDefinitions)("public");
        const supportedKeys = new Set(Object.keys(publicPreRegistrationSchema_1.PUBLIC_FIELD_INPUT_MAP));
        const requiredKeys = new Set(definitions
            .filter((field) => field.requiredPublic && supportedKeys.has(field.fieldKey))
            .map((field) => field.fieldKey));
        const parsed = (0, publicPreRegistrationSchema_1.createPublicPreRegistrationSchema)(requiredKeys).safeParse(request.body);
        if (!parsed.success) {
            return (0, shared_1.sendValidationError)(response, parsed.error.flatten());
        }
        const gateId = parsed.data.gateId?.trim();
        if (!gateId) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { gateId: ["Bitte eine Wache auswählen."] } });
        }
        const gate = await (0, publicPreRegistrations_1.findActiveGateById)(gateId);
        if (!gate) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { gateId: ["Die ausgewählte Wache ist nicht verfügbar."] } });
        }
        const created = await (0, publicPreRegistrations_1.createPreRegistration)({
            ...parsed.data,
            gateId,
            submittedIpAddress: request.ip || request.socket.remoteAddress || null,
            userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null
        });
        return response.status(201).json({
            message: "Voranmeldung erfolgreich gespeichert.",
            visitId: created.visitId,
            visitorId: created.visitorId,
            status: created.status
        });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.use(guard_1.guardRouter);
exports.apiRouter.use(sibe_1.sibeRouter);
exports.apiRouter.use(admin_1.adminRouter);

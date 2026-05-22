"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const multer_1 = __importStar(require("multer"));
const mssql_1 = __importDefault(require("mssql"));
const express_1 = require("express");
const zod_1 = require("zod");
const authSession_1 = require("../lib/authSession");
const guardVisits_1 = require("../lib/guardVisits");
const db_1 = require("../lib/db");
const publicPreRegistrations_1 = require("../lib/publicPreRegistrations");
const publicPreRegistrationSchema_1 = require("../lib/publicPreRegistrationSchema");
const rateLimit_1 = require("../lib/rateLimit");
const siteMaps_1 = require("../lib/siteMaps");
const users_1 = require("../lib/users");
const visitWorkflow_1 = require("../lib/visitWorkflow");
const auditLog_1 = require("../lib/auditLog");
const env_1 = require("../config/env");
const csrfCookieName = "visitor_manager_csrf";
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1),
    password: zod_1.z.string().min(1)
});
const hostSignatureStatusSchema = zod_1.z.enum([
    visitWorkflow_1.HOST_SIGNATURE_STATUS.NOT_REQUIRED,
    visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING,
    visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY,
    visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER,
    visitWorkflow_1.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION
]);
const checkOutSchema = zod_1.z.object({
    signed_by_host_confirmed: zod_1.z.boolean().optional(),
    host_signature_status: hostSignatureStatusSchema.optional(),
    host_signature_date: zod_1.z.string().trim().optional(),
    host_signature_note: zod_1.z.string().trim().optional(),
    checkout_note: zod_1.z.string().trim().optional()
}).superRefine((value, context) => {
    const mappedStatus = value.host_signature_status
        ?? (value.signed_by_host_confirmed ? visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY : undefined);
    if (!mappedStatus) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["host_signature_status"],
            message: "Bitte waehlen Sie einen Unterschriftsstatus."
        });
        return;
    }
    if (mappedStatus === visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER && !value.host_signature_date?.trim()) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["host_signature_date"],
            message: "Bitte geben Sie das Datum der Unterschrift an."
        });
    }
    if (mappedStatus === visitWorkflow_1.HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !value.host_signature_note?.trim()) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["host_signature_note"],
            message: "Bitte dokumentieren Sie die Ausnahme."
        });
    }
});
const guardVisitUpdateSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(1).max(120),
    lastName: zod_1.z.string().trim().min(1).max(120),
    birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    company: zod_1.z.string().trim().min(1).max(255),
    phone: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    email: zod_1.z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
    licensePlate: zod_1.z.string().trim().max(40).optional().or(zod_1.z.literal("")),
    hostName: zod_1.z.string().trim().min(1).max(255),
    hostEmail: zod_1.z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(zod_1.z.literal("")),
    hostPhone: zod_1.z.string().trim().max(80).optional().or(zod_1.z.literal("")),
    hostDepartment: zod_1.z.string().trim().min(1).max(255),
    purpose: zod_1.z.string().trim().min(1).max(500),
    gateId: zod_1.z.string().uuid(),
    validFrom: zod_1.z.string().trim().min(1, "Gueltig von ist erforderlich."),
    validUntil: zod_1.z.string().trim().min(1, "Gueltig bis ist erforderlich."),
    notes: zod_1.z.string().trim().optional().or(zod_1.z.literal(""))
}).superRefine((value, context) => {
    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);
    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil <= validFrom) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validUntil"],
            message: "Gueltig bis muss nach Gueltig von liegen."
        });
    }
    if (value.birthDate) {
        const birthDate = new Date(value.birthDate);
        if (Number.isNaN(birthDate.getTime())) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["birthDate"],
                message: "Ungueltiges Geburtsdatum."
            });
        }
        else if (birthDate > new Date()) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["birthDate"],
                message: "Geburtsdatum darf nicht in der Zukunft liegen."
            });
        }
    }
});
const gateCreateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120),
    description: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal("")),
    location: zod_1.z.string().trim().min(1).max(255),
    isActive: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.number().int().min(0).max(9999).optional()
});
const gateUpdateSchema = gateCreateSchema.partial();
const userCreateSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1).max(120),
    password: zod_1.z.string().min(8).max(128),
    role: zod_1.z.enum(["admin", "guard", "sibe"]),
    gateId: zod_1.z.string().uuid().nullable().optional(),
    isActive: zod_1.z.boolean().optional()
}).superRefine((value, context) => {
    if (value.role === "guard" && !value.gateId) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["gateId"],
            message: "Fuer Guard-Benutzer ist eine Wache erforderlich."
        });
    }
});
const userUpdateSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1).max(120).optional(),
    password: zod_1.z.string().min(8).max(128).optional(),
    role: zod_1.z.enum(["admin", "guard", "sibe"]).optional(),
    gateId: zod_1.z.string().uuid().nullable().optional(),
    isActive: zod_1.z.boolean().optional()
});
const visitCancelSchema = zod_1.z.object({
    cancel_reason: zod_1.z.string().trim().min(1).max(500)
});
const badgeTextUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120),
    textType: zod_1.z.enum(["security_notice", "photo_ban", "signature_notice", "footer"]),
    content: zod_1.z.string().trim().min(1),
    isActive: zod_1.z.boolean().optional()
});
const badgeTextCreateSchema = badgeTextUpdateSchema;
const siteMapUploadNameSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(255).optional()
});
const retentionSettingsSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    days: zod_1.z.number().int().positive().max(3650).optional()
});
exports.apiRouter = (0, express_1.Router)();
const siteMapUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: siteMaps_1.SITE_MAP_MAX_FILE_SIZE_BYTES,
        files: 1
    },
    fileFilter: (_request, file, callback) => {
        const extension = (0, siteMaps_1.getNormalizedExtension)(file.originalname);
        if (!extension || !(0, siteMaps_1.isAllowedSiteMapExtension)(extension) || !(0, siteMaps_1.isAllowedSiteMapMimeType)(file.mimetype)) {
            callback(new Error("invalid_site_map_file"));
            return;
        }
        callback(null, true);
    }
});
function isSchemaMissingError(error) {
    return error instanceof Error && error.message.includes("Invalid object name");
}
function issueCsrfToken(response, currentToken) {
    const token = currentToken || node_crypto_1.default.randomUUID();
    response.cookie(csrfCookieName, token, {
        signed: true,
        sameSite: "strict",
        secure: env_1.env.APP_SECURE_COOKIES,
        httpOnly: true
    });
    return token;
}
function getRequestIp(request) {
    return request.ip || request.socket.remoteAddress || "unknown";
}
function getRequestUserAgent(request) {
    return request.get("user-agent") || null;
}
function sendError(response, status, error, message, details) {
    return response.status(status).json({
        error,
        message,
        ...(details !== undefined ? { details } : {})
    });
}
function sendValidationError(response, details) {
    return sendError(response, 400, "VALIDATION_ERROR", "Bitte pruefen Sie die eingegebenen Daten.", details);
}
function sendForbidden(response) {
    return sendError(response, 403, "FORBIDDEN", "Nicht ausreichend berechtigt.");
}
function sendAuthRequired(response) {
    return sendError(response, 401, "UNAUTHORIZED", "Anmeldung erforderlich.");
}
function handleUnexpectedError(response, error, fallbackErrorCode, fallbackMessage) {
    console.error(error);
    return sendError(response, 500, fallbackErrorCode, fallbackMessage);
}
async function parseSingleSiteMapUpload(request, response) {
    return await new Promise((resolve) => {
        siteMapUpload.array("file", 1)(request, response, (error) => {
            if (!error) {
                const files = request.files;
                if (!Array.isArray(files) || files.length === 0) {
                    sendValidationError(response, { fieldErrors: { file: ["Bitte waehlen Sie eine Datei aus."] } });
                    return resolve(null);
                }
                if (files.length > 1) {
                    sendValidationError(response, { fieldErrors: { file: ["Bitte nur eine Datei hochladen."] } });
                    return resolve(null);
                }
                return resolve(files[0]);
            }
            if (error instanceof multer_1.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    sendError(response, 400, "FILE_TOO_LARGE", "Die Datei ist groesser als 10 MB.");
                    return resolve(null);
                }
                if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
                    sendValidationError(response, { fieldErrors: { file: ["Bitte nur eine Datei hochladen."] } });
                    return resolve(null);
                }
            }
            if (error instanceof Error && error.message === "invalid_site_map_file") {
                sendValidationError(response, {
                    fieldErrors: {
                        file: ["Erlaubt sind nur PNG-, JPG- und WEBP-Dateien."]
                    }
                });
                return resolve(null);
            }
            console.error(error);
            sendError(response, 500, "UPLOAD_ERROR", "Die Datei konnte nicht verarbeitet werden.");
            return resolve(null);
        });
    });
}
async function ensureSiteMapUploadDirectory() {
    const uploadDirectory = node_path_1.default.join(env_1.env.uploadDir, siteMaps_1.SITE_MAP_UPLOAD_SUBDIRECTORY);
    await promises_1.default.mkdir(uploadDirectory, { recursive: true });
    return uploadDirectory;
}
async function listSiteMaps() {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().query(`
    SELECT
      sm.id,
      sm.name,
      sm.file_path AS filePath,
      sm.original_file_name AS originalFileName,
      sm.stored_file_name AS storedFileName,
      sm.mime_type AS mimeType,
      sm.file_size_bytes AS fileSizeBytes,
      sm.is_active AS isActive,
      CONVERT(NVARCHAR(30), sm.created_at, 127) AS createdAt,
      CONVERT(NVARCHAR(30), sm.updated_at, 127) AS updatedAt,
      uploader.username AS uploadedBy
    FROM dbo.site_maps sm
    LEFT JOIN dbo.users uploader ON uploader.id = sm.uploaded_by
    ORDER BY sm.is_active DESC, sm.created_at DESC
  `);
    return result.recordset;
}
async function getActiveSiteMap() {
    const maps = await listSiteMaps();
    return maps.find((entry) => entry.isActive) ?? null;
}
async function deactivateSiteMaps(user, request, ids) {
    for (const id of ids) {
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "SITE_MAP_DEACTIVATED",
            objectType: "site_map",
            objectId: id,
            ipAddress: getRequestIp(request),
            userAgent: getRequestUserAgent(request)
        });
    }
}
async function activateSiteMapById(user, request, siteMapId) {
    const pool = await (0, db_1.getPool)();
    const activeBefore = await pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, siteMapId)
        .query(`
      SELECT id
      FROM dbo.site_maps
      WHERE is_active = 1 AND id <> @id
    `);
    await pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, siteMapId)
        .input("deactivatedBy", mssql_1.default.UniqueIdentifier, user.id)
        .query(`
      UPDATE dbo.site_maps
      SET
        is_active = 0,
        deactivated_at = SYSUTCDATETIME(),
        deactivated_by = @deactivatedBy,
        updated_at = SYSUTCDATETIME()
      WHERE is_active = 1 AND id <> @id
    `);
    await pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, siteMapId)
        .query(`
      UPDATE dbo.site_maps
      SET
        is_active = 1,
        deactivated_at = NULL,
        deactivated_by = NULL,
        updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `);
    await deactivateSiteMaps(user, request, activeBefore.recordset.map((entry) => entry.id));
    await (0, auditLog_1.writeAuditLog)({
        user: user.username,
        userId: user.id,
        action: "SITE_MAP_ACTIVATED",
        objectType: "site_map",
        objectId: siteMapId,
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request)
    });
}
async function getRetentionSettings() {
    const pool = await (0, db_1.getPool)();
    const configured = await pool.request()
        .input("key", mssql_1.default.NVarChar(120), "visitor_retention_days")
        .query("SELECT [value] AS value FROM dbo.system_settings WHERE [key] = @key");
    const raw = configured.recordset[0]?.value?.trim();
    if (!raw) {
        return {
            enabled: true,
            days: env_1.env.VISITOR_RETENTION_DAYS
        };
    }
    if (raw.toLowerCase() === "disabled") {
        return {
            enabled: false,
            days: null
        };
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
            enabled: true,
            days: env_1.env.VISITOR_RETENTION_DAYS
        };
    }
    return {
        enabled: true,
        days: parsed
    };
}
async function resolveAuthenticatedUser(request) {
    if (request.auth !== undefined) {
        return request.auth;
    }
    const token = request.cookies?.[(0, authSession_1.getSessionCookieName)()];
    const sessionUser = (0, authSession_1.readSessionToken)(token);
    if (!sessionUser) {
        request.auth = null;
        return null;
    }
    const currentUser = await (0, users_1.findUserById)(sessionUser.id);
    request.auth = currentUser;
    return currentUser;
}
async function requireAuthenticatedUser(request, response) {
    const user = await resolveAuthenticatedUser(request);
    if (!user) {
        sendAuthRequired(response);
        return null;
    }
    return user;
}
async function requireRole(request, response, allowedRoles) {
    const user = await requireAuthenticatedUser(request, response);
    if (!user) {
        return null;
    }
    if (!allowedRoles.includes(user.role)) {
        sendForbidden(response);
        return null;
    }
    return user;
}
exports.apiRouter.get("/api/meta", (_request, response) => {
    response.json({
        modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
        status: "active"
    });
});
exports.apiRouter.get("/api/auth/me", async (request, response) => {
    const user = await resolveAuthenticatedUser(request);
    if (!user) {
        return response.json({
            authenticated: false
        });
    }
    return response.json({
        authenticated: true,
        user
    });
});
exports.apiRouter.post("/api/auth/login", async (request, response) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
        return sendValidationError(response, result.error.flatten());
    }
    const candidate = await (0, users_1.findUserForLogin)(result.data.username);
    if (!candidate || !candidate.isActive) {
        return response.status(401).json({
            error: "UNAUTHORIZED",
            message: "Benutzername oder Passwort ist falsch."
        });
    }
    const passwordMatches = await (0, users_1.verifyPassword)(result.data.password, candidate.passwordHash);
    if (!passwordMatches) {
        return response.status(401).json({
            error: "UNAUTHORIZED",
            message: "Benutzername oder Passwort ist falsch."
        });
    }
    const user = {
        id: candidate.id,
        username: candidate.username,
        role: candidate.role,
        gateId: candidate.gateId
    };
    (0, authSession_1.setSessionCookie)(response, user);
    await (0, db_1.getPool)().then((pool) => pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, user.id)
        .query("UPDATE dbo.users SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id"));
    await (0, auditLog_1.writeAuditLog)({
        user: user.username,
        userId: user.id,
        action: "USER_LOGIN",
        objectType: "user",
        objectId: user.id,
        ipAddress: getRequestIp(request)
    });
    return response.json({
        authenticated: true,
        user,
        redirectTo: user.role === "admin" ? "/admin" : user.role === "sibe" ? "/sibe" : "/wache"
    });
});
exports.apiRouter.post("/api/auth/logout", async (request, response) => {
    const user = await resolveAuthenticatedUser(request);
    (0, authSession_1.clearSessionCookie)(response);
    if (user) {
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "USER_LOGOUT",
            objectType: "user",
            objectId: user.id,
            ipAddress: getRequestIp(request)
        });
    }
    response.json({ success: true });
});
exports.apiRouter.get("/api/public/gates", async (request, response) => {
    try {
        const gates = await (0, publicPreRegistrations_1.listActiveGates)();
        const csrfToken = issueCsrfToken(response, request.signedCookies?.[csrfCookieName]);
        return response.json({ gates, csrfToken });
    }
    catch (error) {
        console.error(error);
        if (isSchemaMissingError(error)) {
            return response.status(500).json({
                error: "DATABASE_SCHEMA_MISSING",
                message: "Die Datenbanktabellen wurden noch nicht initialisiert. Bitte Migrationen ausfuehren."
            });
        }
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wachen konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/public/pre-registrations", async (request, response) => {
    const csrfCookieToken = request.signedCookies?.[csrfCookieName];
    const csrfHeaderToken = request.header("x-csrf-token");
    if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
        return sendError(response, 403, "FORBIDDEN", "Die Formularsitzung ist abgelaufen.");
    }
    const ipAddress = getRequestIp(request);
    const rateLimit = (0, rateLimit_1.checkRateLimit)(`public-pre-registration:${ipAddress}`, env_1.env.PUBLIC_FORM_RATE_LIMIT, env_1.env.PUBLIC_FORM_RATE_WINDOW_SECONDS);
    response.setHeader("X-RateLimit-Limit", env_1.env.PUBLIC_FORM_RATE_LIMIT.toString());
    response.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());
    if (!rateLimit.allowed) {
        response.setHeader("Retry-After", rateLimit.retryAfterSeconds.toString());
        return response.status(429).json({
            error: "RATE_LIMITED",
            message: "Zu viele Anfragen in kurzer Zeit.",
            retryAfterSeconds: rateLimit.retryAfterSeconds
        });
    }
    const result = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse(request.body);
    if (!result.success) {
        return sendValidationError(response, result.error.flatten());
    }
    try {
        const created = await (0, publicPreRegistrations_1.createPreRegistration)({
            ...result.data,
            submittedIpAddress: ipAddress,
            userAgent: getRequestUserAgent(request)
        });
        return response.status(201).json({
            status: created.status,
            visitId: created.visitId,
            visitorId: created.visitorId,
            message: "Voranmeldung wurde erfolgreich gespeichert."
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === "gate_not_found") {
            return response.status(404).json({
                error: "NOT_FOUND",
                message: "Die ausgewaehlte Wache ist nicht mehr aktiv."
            });
        }
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.get("/api/guard/visits/today", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    try {
        const visits = await (0, guardVisits_1.getTodayVisitsForUser)(user, {
            search: typeof request.query.search === "string" ? request.query.search : undefined,
            status: typeof request.query.status === "string" ? request.query.status : undefined
        });
        return response.json({ visits });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Tagesuebersicht konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/guard/visits/:id", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    try {
        const visit = await (0, guardVisits_1.getVisitDetailForUser)(user, request.params.id);
        if (!visit) {
            return response.status(404).json({
                error: "NOT_FOUND",
                message: "Der Besuch wurde nicht gefunden."
            });
        }
        return response.json({ visit });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdaten konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/guard/visits/:id/check-in", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    try {
        await (0, guardVisits_1.checkInVisit)(user, request.params.id, getRequestIp(request), getRequestUserAgent(request));
        return response.json({
            success: true,
            status: visitWorkflow_1.VISIT_STATUS.CHECKED_IN
        });
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message === "visit_not_found") {
                return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
            }
            if (error.message === "visit_scope_forbidden") {
                return sendForbidden(response);
            }
            if (error.message === "invalid_check_in_status") {
                return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht eingecheckt werden.");
            }
        }
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-in konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.put("/api/guard/visits/:id", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    const result = guardVisitUpdateSchema.safeParse(request.body);
    if (!result.success) {
        return sendValidationError(response, result.error.flatten());
    }
    try {
        await (0, guardVisits_1.updateVisitForGuard)(user, request.params.id, result.data, getRequestIp(request), getRequestUserAgent(request));
        return response.json({ success: true });
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message === "visit_not_found") {
                return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
            }
            if (error.message === "visit_scope_forbidden") {
                return sendForbidden(response);
            }
            if (error.message === "visit_update_status_forbidden") {
                return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht mehr bearbeitet werden.");
            }
        }
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdaten konnten nicht gespeichert werden.");
    }
});
exports.apiRouter.post("/api/guard/visits/:id/check-out", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    const result = checkOutSchema.safeParse(request.body);
    if (!result.success) {
        return sendValidationError(response, result.error.flatten());
    }
    try {
        await (0, guardVisits_1.checkOutVisit)(user, request.params.id, {
            status: result.data.host_signature_status
                ?? (result.data.signed_by_host_confirmed ? visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY : visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING),
            signatureDate: result.data.host_signature_date,
            note: result.data.host_signature_note
        }, result.data.checkout_note, getRequestIp(request), getRequestUserAgent(request));
        return response.json({
            success: true,
            status: visitWorkflow_1.VISIT_STATUS.CHECKED_OUT
        });
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message === "visit_not_found") {
                return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
            }
            if (error.message === "visit_scope_forbidden") {
                return sendForbidden(response);
            }
            if (error.message === "host_signature_required") {
                return sendError(response, 400, "VALIDATION_ERROR", "Bitte waehlen Sie einen gueltigen Unterschriftsstatus.");
            }
            if (error.message === "host_signature_date_required") {
                return sendError(response, 400, "VALIDATION_ERROR", "Bitte geben Sie das Datum der Unterschrift an.");
            }
            if (error.message === "host_signature_note_required") {
                return sendError(response, 400, "VALIDATION_ERROR", "Bitte dokumentieren Sie die Ausnahme.");
            }
            if (error.message === "host_signature_date_before_visit") {
                return sendError(response, 400, "VALIDATION_ERROR", "Das Datum der Unterschrift darf nicht vor dem Besuchsbeginn liegen.");
            }
            if (error.message === "invalid_check_out_status") {
                return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht ausgecheckt werden.");
            }
        }
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-out konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.post("/api/guard/visits/:id/print-log", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user) {
        return;
    }
    await (0, auditLog_1.writeAuditLog)({
        user: user.username,
        userId: user.id,
        action: "VISIT_BADGE_PRINTED",
        objectType: "visit",
        objectId: request.params.id,
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request)
    });
    return response.json({ success: true });
});
exports.apiRouter.post("/api/guard/visits/:id/cancel", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard"]);
    if (!user)
        return;
    const parsed = visitCancelSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    try {
        const pool = await (0, db_1.getPool)();
        const visitResult = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT gate_id AS gateId, status FROM dbo.visits WHERE id = @id");
        const visit = visitResult.recordset[0];
        if (!visit) {
            return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
        }
        if (user.role === "guard" && user.gateId !== visit.gateId) {
            return sendForbidden(response);
        }
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("cancelledBy", mssql_1.default.UniqueIdentifier, user.id)
            .input("cancelReason", mssql_1.default.NVarChar(500), parsed.data.cancel_reason)
            .query(`
        UPDATE dbo.visits
        SET
          status = '${visitWorkflow_1.VISIT_STATUS.CANCELLED}',
          cancelled_at = SYSUTCDATETIME(),
          cancelled_by = @cancelledBy,
          cancel_reason = @cancelReason,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISIT_CANCELLED",
            objectType: "visit",
            objectId: request.params.id,
            ipAddress: getRequestIp(request)
        });
        return response.json({ success: true, status: visitWorkflow_1.VISIT_STATUS.CANCELLED });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besuch konnte nicht storniert werden.");
    }
});
exports.apiRouter.get("/api/sibe/summary", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const [visitorsTotal, activeVisitors, todaysVisits, checkedInVisitors, usersTotal, activeUsers] = await Promise.all([
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0 AND is_active = 1"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.visits WHERE CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in'"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.users"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.users WHERE is_active = 1")
        ]);
        return response.json({
            visitorsTotal: visitorsTotal.recordset[0]?.count ?? 0,
            activeVisitors: activeVisitors.recordset[0]?.count ?? 0,
            todaysVisits: todaysVisits.recordset[0]?.count ?? 0,
            checkedInVisitors: checkedInVisitors.recordset[0]?.count ?? 0,
            usersTotal: usersTotal.recordset[0]?.count ?? 0,
            activeUsers: activeUsers.recordset[0]?.count ?? 0
        });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die SiBe-Uebersicht konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/sibe/visitors", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
        const requestBuilder = pool.request();
        let whereClause = "v.is_deleted = 0";
        if (search) {
            requestBuilder.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
            whereClause += " AND (v.first_name LIKE @search OR v.last_name LIKE @search OR v.company LIKE @search)";
        }
        const result = await requestBuilder.query(`
      SELECT
        v.id,
        v.first_name AS firstName,
        v.last_name AS lastName,
        v.company,
        CONVERT(NVARCHAR(10), v.birth_date, 23) AS birthDate,
        v.phone_optional AS phone,
        v.email_optional AS email,
        CONVERT(NVARCHAR(30), v.archived_at, 127) AS archivedAt,
        COUNT(vi.id) AS visitCount,
        CONVERT(NVARCHAR(30), MAX(vi.valid_from), 127) AS lastVisitAt
      FROM dbo.visitors v
      LEFT JOIN dbo.visits vi ON vi.visitor_id = v.id
      WHERE ${whereClause}
      GROUP BY v.id, v.first_name, v.last_name, v.company, v.birth_date, v.phone_optional, v.email_optional, v.archived_at
      ORDER BY v.last_name ASC, v.first_name ASC
    `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "SIBE_VISITOR_SEARCH",
            objectType: "visitor",
            objectId: "search",
            ipAddress: getRequestIp(request)
        });
        return response.json({ visitors: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besucher konnten nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/sibe/visits", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const requestBuilder = pool.request();
        const conditions = ["1 = 1"];
        const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
        const status = typeof request.query.status === "string" ? request.query.status.trim() : "";
        const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
        const from = typeof request.query.dateFrom === "string" ? request.query.dateFrom.trim() : "";
        const to = typeof request.query.dateTo === "string" ? request.query.dateTo.trim() : "";
        if (search) {
            requestBuilder.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
            conditions.push(`(
        vis.first_name LIKE @search
        OR vis.last_name LIKE @search
        OR vis.company LIKE @search
        OR vt.host_name LIKE @search
        OR vt.host_department LIKE @search
        OR ISNULL(vt.license_plate, '') LIKE @search
        OR ISNULL(vt.badge_number, '') LIKE @search
      )`);
        }
        if (status && status !== "all") {
            requestBuilder.input("status", mssql_1.default.NVarChar(32), status);
            conditions.push("vt.status = @status");
        }
        if (gateId) {
            requestBuilder.input("gateId", mssql_1.default.UniqueIdentifier, gateId);
            conditions.push("vt.gate_id = @gateId");
        }
        if (from) {
            requestBuilder.input("dateFrom", mssql_1.default.DateTime2, new Date(from));
            conditions.push("vt.valid_from >= @dateFrom");
        }
        if (to) {
            requestBuilder.input("dateTo", mssql_1.default.DateTime2, new Date(to));
            conditions.push("vt.valid_until <= @dateTo");
        }
        const result = await requestBuilder.query(`
      SELECT
        vt.id,
        vis.id AS visitorId,
        CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
        vis.company,
        vt.license_plate AS licensePlate,
        vt.badge_number AS badgeNumber,
        vt.status,
        g.name AS gateName,
        vt.host_name AS hostName,
        vt.host_department AS hostDepartment,
        CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
        CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
        CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
        CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
        ISNULL(vt.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus
      FROM dbo.visits vt
      INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
      INNER JOIN dbo.gates g ON g.id = vt.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY vt.valid_from DESC
    `);
        return response.json({ visits: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchshistorie konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/sibe/visits/:id", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query(`
        SELECT
          vt.id,
          vt.status,
          CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
          CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
          CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
          CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
          vis.first_name AS firstName,
          vis.last_name AS lastName,
          vis.company,
          CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
          vis.phone_optional AS visitorPhone,
          vis.email_optional AS visitorEmail,
          vt.host_name AS hostName,
          vt.host_email AS hostEmail,
          vt.host_phone AS hostPhone,
          vt.host_department AS hostDepartment,
          vt.purpose,
          vt.gate_id AS gateId,
          g.name AS gateName,
          vt.license_plate AS licensePlate,
          vt.signed_by_host_confirmed AS signedByHostConfirmed,
          ISNULL(vt.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
          CONVERT(NVARCHAR(10), vt.host_signature_date, 23) AS hostSignatureDate,
          vt.host_signature_note AS hostSignatureNote,
          confirmer.username AS hostSignatureConfirmedBy,
          CONVERT(NVARCHAR(30), vt.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
          vt.checkout_note AS checkoutNote,
          vt.notes,
          vt.badge_number AS badgeNumber
        FROM dbo.visits vt
        INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
        INNER JOIN dbo.gates g ON g.id = vt.gate_id
        LEFT JOIN dbo.users confirmer ON confirmer.id = vt.host_signature_confirmed_by
        WHERE vt.id = @id
      `);
        const visit = result.recordset[0];
        if (!visit) {
            return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
        }
        return response.json({ visit });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdetails konnten nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/sibe/users", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const requestBuilder = pool.request();
        const conditions = ["1 = 1"];
        const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
        const role = typeof request.query.role === "string" ? request.query.role.trim() : "";
        const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
        const active = typeof request.query.active === "string" ? request.query.active.trim() : "";
        if (search) {
            requestBuilder.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
            conditions.push("u.username LIKE @search");
        }
        if (role && role !== "all") {
            requestBuilder.input("role", mssql_1.default.NVarChar(32), role);
            conditions.push("u.role = @role");
        }
        if (gateId) {
            requestBuilder.input("gateId", mssql_1.default.UniqueIdentifier, gateId);
            conditions.push("u.gate_id = @gateId");
        }
        if (active === "true") {
            conditions.push("u.is_active = 1");
        }
        else if (active === "false") {
            conditions.push("u.is_active = 0");
        }
        const result = await requestBuilder.query(`
      SELECT
        u.id,
        u.username,
        u.role,
        g.name AS gateName,
        u.is_active AS isActive,
        CONVERT(NVARCHAR(30), u.created_at, 127) AS createdAt,
        CONVERT(NVARCHAR(30), u.last_login_at, 127) AS lastLoginAt
      FROM dbo.users u
      LEFT JOIN dbo.gates g ON g.id = u.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY u.username ASC
    `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "SIBE_USER_SEARCH",
            objectType: "user",
            objectId: "search",
            ipAddress: getRequestIp(request)
        });
        return response.json({ users: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/sibe/audit-logs", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "sibe"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request().query(`
      SELECT TOP 200
        id,
        [user],
        action,
        object_type AS objectType,
        object_id AS objectId,
        ip_address AS ipAddress,
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.audit_logs
      ORDER BY [timestamp] DESC
    `);
        return response.json({ logs: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Auditlog konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/admin/badge-texts", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user) {
        return;
    }
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().query(`
    SELECT
      id,
      name,
      text_type AS textType,
      content,
      is_active AS isActive
    FROM dbo.badge_text_templates
    ORDER BY text_type ASC, name ASC
  `);
    return response.json({
        texts: result.recordset
    });
});
exports.apiRouter.post("/api/admin/badge-texts", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const parsed = badgeTextCreateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    try {
        const pool = await (0, db_1.getPool)();
        const created = await pool.request()
            .input("name", parsed.data.name)
            .input("textType", parsed.data.textType)
            .input("content", parsed.data.content)
            .input("isActive", parsed.data.isActive ?? true)
            .input("updatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        INSERT INTO dbo.badge_text_templates(name, text_type, content, is_active, updated_by)
        OUTPUT inserted.id
        VALUES(@name, @textType, @content, @isActive, @updatedBy)
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            action: "ADMIN_BADGE_TEXT_CREATED",
            objectType: "badge_text",
            objectId: created.recordset[0].id,
            ipAddress: getRequestIp(request)
        });
        return response.status(201).json({ id: created.recordset[0].id });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht angelegt werden.");
    }
});
exports.apiRouter.get("/api/admin/bootstrap", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user) {
        return;
    }
    const pool = await (0, db_1.getPool)();
    const [users, gates, templates] = await Promise.all([
        pool.request().query("SELECT COUNT(*) AS count FROM dbo.users"),
        pool.request().query("SELECT COUNT(*) AS count FROM dbo.gates"),
        pool.request().query("SELECT COUNT(*) AS count FROM dbo.badge_text_templates")
    ]);
    return response.json({
        users: users.recordset[0]?.count ?? 0,
        gates: gates.recordset[0]?.count ?? 0,
        templates: templates.recordset[0]?.count ?? 0
    });
});
exports.apiRouter.get("/api/admin/gates", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request().query(`
      SELECT id, name, description, location, is_active AS isActive, sort_order AS sortOrder
      FROM dbo.gates
      ORDER BY sort_order ASC, name ASC
    `);
        response.json({ gates: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wachen konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/admin/gates", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const parsed = gateCreateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    try {
        const pool = await (0, db_1.getPool)();
        const data = parsed.data;
        const created = await pool.request()
            .input("name", data.name)
            .input("description", data.description?.trim() || null)
            .input("location", data.location?.trim() || null)
            .input("isActive", data.isActive ?? true)
            .input("sortOrder", data.sortOrder ?? 100)
            .query(`
        INSERT INTO dbo.gates(name, description, location, is_active, sort_order)
        OUTPUT inserted.id
        VALUES(@name, @description, @location, @isActive, @sortOrder)
      `);
        await (0, auditLog_1.writeAuditLog)({ user: user.username, action: "ADMIN_GATE_CREATED", objectType: "gate", objectId: created.recordset[0].id, ipAddress: getRequestIp(request) });
        response.status(201).json({ id: created.recordset[0].id });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.put("/api/admin/gates/:id", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const parsed = gateUpdateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const data = parsed.data;
    try {
        const pool = await (0, db_1.getPool)();
        if (data.isActive === false) {
            const activeGates = await pool.request().query("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1");
            if ((activeGates.recordset[0]?.count ?? 0) <= 1) {
                return sendError(response, 409, "VALIDATION_ERROR", "Mindestens eine aktive Wache muss erhalten bleiben.");
            }
        }
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("updatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .input("name", data.name)
            .input("description", data.description?.trim() || null)
            .input("location", data.location?.trim() || null)
            .input("isActive", data.isActive)
            .input("sortOrder", data.sortOrder)
            .query(`
        UPDATE dbo.gates
        SET
          name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          location = COALESCE(@location, location),
          is_active = COALESCE(@isActive, is_active),
          deactivated_at = CASE
            WHEN @isActive = 0 THEN COALESCE(deactivated_at, SYSUTCDATETIME())
            WHEN @isActive = 1 THEN NULL
            ELSE deactivated_at
          END,
          deactivated_by = CASE
            WHEN @isActive = 0 THEN COALESCE(deactivated_by, @updatedBy)
            WHEN @isActive = 1 THEN NULL
            ELSE deactivated_by
          END,
          sort_order = COALESCE(@sortOrder, sort_order),
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: user.username, action: "ADMIN_GATE_UPDATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht aktualisiert werden.");
    }
});
exports.apiRouter.post("/api/admin/gates/:id/deactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const gateCandidate = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT is_active AS isActive FROM dbo.gates WHERE id = @id");
        const gateToDelete = gateCandidate.recordset[0];
        if (!gateToDelete) {
            return sendError(response, 404, "NOT_FOUND", "Wache wurde nicht gefunden.");
        }
        if (gateToDelete.isActive) {
            const activeGates = await pool.request().query("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1");
            if ((activeGates.recordset[0]?.count ?? 0) <= 1) {
                return sendError(response, 409, "VALIDATION_ERROR", "Mindestens eine aktive Wache muss erhalten bleiben.");
            }
        }
        const linkedUsers = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT COUNT(*) AS count FROM dbo.users WHERE gate_id = @id AND is_active = 1");
        if ((linkedUsers.recordset[0]?.count ?? 0) > 0) {
            return sendError(response, 409, "VALIDATION_ERROR", "Wache kann nicht deaktiviert werden, solange aktive Benutzer zugeordnet sind.");
        }
        const linkedVisits = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT COUNT(*) AS count FROM dbo.visits WHERE gate_id = @id");
        if ((linkedVisits.recordset[0]?.count ?? 0) > 0) {
            return sendError(response, 409, "VALIDATION_ERROR", "Wache kann nicht deaktiviert werden, solange Besuche zugeordnet sind.");
        }
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.gates
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: user.username, userId: user.id, action: "GATE_DEACTIVATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht deaktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/gates/:id/reactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query(`
        UPDATE dbo.gates
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: user.username, userId: user.id, action: "GATE_REACTIVATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht reaktiviert werden.");
    }
});
exports.apiRouter.get("/api/admin/users", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request().query(`
      SELECT id, username, role, gate_id AS gateId, is_active AS isActive, CONVERT(NVARCHAR(30), last_login_at, 127) AS lastLoginAt
      FROM dbo.users
      ORDER BY username ASC
    `);
        response.json({ users: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/admin/users", async (request, response) => {
    const admin = await requireRole(request, response, ["admin"]);
    if (!admin)
        return;
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const data = parsed.data;
    try {
        const passwordHash = await (0, users_1.hashPassword)(data.password);
        const pool = await (0, db_1.getPool)();
        const created = await pool.request()
            .input("username", data.username)
            .input("passwordHash", passwordHash)
            .input("role", data.role)
            .input("gateId", data.role === "admin" ? null : data.gateId ?? null)
            .input("isActive", data.isActive ?? true)
            .query(`
        INSERT INTO dbo.users(username, password_hash, display_name, role, gate_id, is_active)
        OUTPUT inserted.id
        VALUES(@username, @passwordHash, @username, @role, @gateId, @isActive)
      `);
        await (0, auditLog_1.writeAuditLog)({ user: admin.username, action: "ADMIN_USER_CREATED", objectType: "user", objectId: created.recordset[0].id, ipAddress: getRequestIp(request) });
        response.status(201).json({ id: created.recordset[0].id });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht angelegt werden.");
    }
});
exports.apiRouter.put("/api/admin/users/:id", async (request, response) => {
    const admin = await requireRole(request, response, ["admin"]);
    if (!admin)
        return;
    const parsed = userUpdateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const data = parsed.data;
    try {
        const pool = await (0, db_1.getPool)();
        const existing = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT role, is_active AS isActive, gate_id AS gateId FROM dbo.users WHERE id = @id");
        const currentUser = existing.recordset[0];
        if (!currentUser) {
            return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
        }
        const nextRole = data.role ?? currentUser.role;
        const nextActive = data.isActive ?? currentUser.isActive;
        const nextGateId = nextRole === "admin" ? null : (data.gateId ?? currentUser.gateId);
        if (nextRole === "guard" && !nextGateId) {
            return sendError(response, 400, "VALIDATION_ERROR", "Fuer Guard-Benutzer ist eine Wache erforderlich.");
        }
        if (currentUser.role === "admin" && (!nextActive || nextRole !== "admin")) {
            const adminCount = await pool.request().query("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
            if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
                return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
            }
        }
        let passwordHash = null;
        if (data.password) {
            passwordHash = await (0, users_1.hashPassword)(data.password);
        }
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("username", data.username)
            .input("passwordHash", passwordHash)
            .input("role", data.role)
            .input("gateId", nextGateId)
            .input("isActive", data.isActive)
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, admin.id)
            .query(`
        UPDATE dbo.users
        SET
          username = COALESCE(@username, username),
          display_name = COALESCE(@username, display_name),
          password_hash = COALESCE(@passwordHash, password_hash),
          role = COALESCE(@role, role),
          gate_id = CASE WHEN @gateId IS NULL AND @role = 'admin' THEN NULL ELSE COALESCE(@gateId, gate_id) END,
          is_active = COALESCE(@isActive, is_active),
          deactivated_at = CASE
            WHEN @isActive = 0 THEN COALESCE(deactivated_at, SYSUTCDATETIME())
            WHEN @isActive = 1 THEN NULL
            ELSE deactivated_at
          END,
          deactivated_by = CASE
            WHEN @isActive = 0 THEN COALESCE(deactivated_by, @deactivatedBy)
            WHEN @isActive = 1 THEN NULL
            ELSE deactivated_by
          END,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: admin.username, action: "ADMIN_USER_UPDATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht aktualisiert werden.");
    }
});
exports.apiRouter.post("/api/admin/users/:id/deactivate", async (request, response) => {
    const admin = await requireRole(request, response, ["admin"]);
    if (!admin)
        return;
    if (admin.id === request.params.id) {
        return sendError(response, 409, "VALIDATION_ERROR", "Der aktuell angemeldete Admin kann sich nicht selbst deaktivieren.");
    }
    try {
        const pool = await (0, db_1.getPool)();
        const userToDelete = await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query("SELECT role, is_active AS isActive FROM dbo.users WHERE id = @id");
        const candidate = userToDelete.recordset[0];
        if (!candidate) {
            return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
        }
        if (candidate.role === "admin" && candidate.isActive) {
            const adminCount = await pool.request().query("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
            if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
                return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
            }
        }
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, admin.id)
            .query(`
        UPDATE dbo.users
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: admin.username, userId: admin.id, action: "USER_DEACTIVATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht deaktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/users/:id/reactivate", async (request, response) => {
    const admin = await requireRole(request, response, ["admin"]);
    if (!admin)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query(`
        UPDATE dbo.users
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: admin.username, userId: admin.id, action: "USER_REACTIVATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht reaktiviert werden.");
    }
});
exports.apiRouter.put("/api/admin/badge-texts/:id", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const parsed = badgeTextUpdateSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const data = parsed.data;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("name", data.name)
            .input("textType", data.textType)
            .input("content", data.content)
            .input("isActive", data.isActive ?? true)
            .input("updatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.badge_text_templates
        SET
          name = @name,
          text_type = @textType,
          content = @content,
          is_active = @isActive,
          deactivated_at = CASE WHEN @isActive = 0 THEN COALESCE(deactivated_at, SYSUTCDATETIME()) WHEN @isActive = 1 THEN NULL ELSE deactivated_at END,
          deactivated_by = CASE WHEN @isActive = 0 THEN COALESCE(deactivated_by, @updatedBy) WHEN @isActive = 1 THEN NULL ELSE deactivated_by END,
          updated_by = @updatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({ user: user.username, action: "ADMIN_BADGE_TEXT_UPDATED", objectType: "badge_text", objectId: request.params.id, ipAddress: getRequestIp(request) });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht aktualisiert werden.");
    }
});
exports.apiRouter.post("/api/admin/badge-texts/:id/deactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.badge_text_templates
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "BADGE_TEXT_DEACTIVATED",
            objectType: "badge_text",
            objectId: request.params.id,
            ipAddress: getRequestIp(request)
        });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht deaktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/badge-texts/:id/reactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .query(`
        UPDATE dbo.badge_text_templates
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "BADGE_TEXT_REACTIVATED",
            objectType: "badge_text",
            objectId: request.params.id,
            ipAddress: getRequestIp(request)
        });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht reaktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/site-map/upload", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const file = await parseSingleSiteMapUpload(request, response);
    if (!file)
        return;
    const parsed = siteMapUploadNameSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const extension = (0, siteMaps_1.getNormalizedExtension)(file.originalname);
    if (!extension || !(0, siteMaps_1.isAllowedSiteMapExtension)(extension) || !(0, siteMaps_1.isAllowedSiteMapMimeType)(file.mimetype)) {
        return sendValidationError(response, { fieldErrors: { file: ["Erlaubt sind nur PNG-, JPG- und WEBP-Dateien."] } });
    }
    const storedFileName = (0, siteMaps_1.buildStoredSiteMapFileName)(extension);
    const filePath = (0, siteMaps_1.buildSiteMapPublicPath)(storedFileName);
    const uploadDirectory = await ensureSiteMapUploadDirectory();
    const targetPath = node_path_1.default.join(uploadDirectory, storedFileName);
    const pool = await (0, db_1.getPool)();
    try {
        const activeBefore = await pool.request().query(`
      SELECT id
      FROM dbo.site_maps
      WHERE is_active = 1
    `);
        await promises_1.default.writeFile(targetPath, file.buffer);
        await pool.request()
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.site_maps
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE is_active = 1
      `);
        const created = await pool.request()
            .input("name", mssql_1.default.NVarChar(255), parsed.data.name || node_path_1.default.basename(file.originalname, node_path_1.default.extname(file.originalname)))
            .input("filePath", mssql_1.default.NVarChar(500), filePath)
            .input("originalFileName", mssql_1.default.NVarChar(255), file.originalname)
            .input("storedFileName", mssql_1.default.NVarChar(255), storedFileName)
            .input("mimeType", mssql_1.default.NVarChar(120), file.mimetype)
            .input("fileSizeBytes", mssql_1.default.BigInt, file.size)
            .input("uploadedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        INSERT INTO dbo.site_maps (
          name,
          file_path,
          original_file_name,
          stored_file_name,
          mime_type,
          file_size_bytes,
          is_active,
          uploaded_by,
          created_at,
          updated_at
        )
        OUTPUT inserted.id
        VALUES (
          @name,
          @filePath,
          @originalFileName,
          @storedFileName,
          @mimeType,
          @fileSizeBytes,
          1,
          @uploadedBy,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        )
      `);
        await deactivateSiteMaps(user, request, activeBefore.recordset.map((entry) => entry.id));
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "ADMIN_SITE_MAP_UPLOADED",
            objectType: "site_map",
            objectId: created.recordset[0].id,
            ipAddress: getRequestIp(request),
            userAgent: getRequestUserAgent(request),
            metadata: {
                site_map_id: created.recordset[0].id,
                original_file_name: file.originalname,
                stored_file_name: storedFileName,
                mime_type: file.mimetype,
                file_size_bytes: file.size,
                uploaded_by: user.id
            }
        });
        return response.status(201).json({
            id: created.recordset[0].id,
            filePath
        });
    }
    catch (error) {
        await promises_1.default.rm(targetPath, { force: true }).catch(() => undefined);
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht hochgeladen werden.");
    }
});
exports.apiRouter.get("/api/admin/site-map/active", async (request, response) => {
    const user = await requireRole(request, response, ["admin", "guard", "sibe"]);
    if (!user)
        return;
    try {
        const siteMap = await getActiveSiteMap();
        return response.json({ siteMap });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Gelaendeplan konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/admin/site-map", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const siteMap = await getActiveSiteMap();
        return response.json({ siteMap });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Gelaendeplan konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/admin/site-maps", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const siteMaps = await listSiteMaps();
        return response.json({ siteMaps });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Gelaendeplaene konnten nicht geladen werden.");
    }
});
exports.apiRouter.post("/api/admin/site-maps/:id/deactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("deactivatedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.site_maps
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "SITE_MAP_DEACTIVATED",
            objectType: "site_map",
            objectId: request.params.id,
            ipAddress: getRequestIp(request),
            userAgent: getRequestUserAgent(request)
        });
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht deaktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/site-maps/:id/activate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        await activateSiteMapById(user, request, request.params.id);
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht aktiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/site-maps/:id/reactivate", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        await activateSiteMapById(user, request, request.params.id);
        response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht aktiviert werden.");
    }
});
exports.apiRouter.get("/api/admin/audit-logs", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request().query(`
      SELECT TOP 200
        id,
        [user],
        action,
        object_type AS objectType,
        object_id AS objectId,
        ip_address AS ipAddress,
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.audit_logs
      ORDER BY [timestamp] DESC
    `);
        response.json({ logs: result.recordset });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Auditlog konnte nicht geladen werden.");
    }
});
exports.apiRouter.get("/api/admin/system-status", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const retention = await getRetentionSettings();
        const [activeVisits, configuredGates, staleVisits, openPreRegistrationsToday] = await Promise.all([
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in'"),
            pool.request().query("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1"),
            pool.request()
                .input("retentionDays", mssql_1.default.Int, retention.days ?? env_1.env.VISITOR_RETENTION_DAYS)
                .query(`
          SELECT COUNT(*) AS count
          FROM dbo.visits
          WHERE created_at < DATEADD(day, -@retentionDays, SYSUTCDATETIME())
        `),
            pool.request().query(`
        SELECT COUNT(*) AS count
        FROM dbo.visits
        WHERE status = '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}'
          AND CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)
      `)
        ]);
        response.json({
            app: "ok",
            environment: env_1.env.NODE_ENV,
            activeVisits: activeVisits.recordset[0]?.count ?? 0,
            activeGates: configuredGates.recordset[0]?.count ?? 0,
            openPreRegistrationsToday: openPreRegistrationsToday.recordset[0]?.count ?? 0,
            staleVisits: retention.enabled ? staleVisits.recordset[0]?.count ?? 0 : 0,
            retentionDays: retention.days,
            retentionEnabled: retention.enabled,
            dbHost: env_1.env.MSSQL_HOST,
            dbName: env_1.env.MSSQL_DATABASE
        });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Systemstatus konnte nicht geladen werden.");
    }
});
exports.apiRouter.put("/api/admin/system-settings/retention", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    const parsed = retentionSettingsSchema.safeParse(request.body);
    if (!parsed.success)
        return sendValidationError(response, parsed.error.flatten());
    const settingValue = parsed.data.enabled ? String(parsed.data.days ?? env_1.env.VISITOR_RETENTION_DAYS) : "disabled";
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("key", mssql_1.default.NVarChar(120), "visitor_retention_days")
            .input("value", mssql_1.default.NVarChar(mssql_1.default.MAX), settingValue)
            .query(`
        MERGE dbo.system_settings AS target
        USING (SELECT @key AS [key], @value AS [value]) AS source
        ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET [value] = source.[value], updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([key], [value], description) VALUES (source.[key], source.[value], 'Retention in days for visit cleanup');
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            action: "SYSTEM_SETTING_UPDATED",
            objectType: "system_setting",
            objectId: "visitor_retention_days",
            ipAddress: getRequestIp(request)
        });
        return response.json({ success: true, retentionValue: settingValue });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Aufbewahrungseinstellung konnte nicht gespeichert werden.");
    }
});
exports.apiRouter.post("/api/admin/visitors/:id/archive", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, request.params.id)
            .input("deletedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.visitors
        SET
          is_deleted = 1,
          is_active = 0,
          archived_at = COALESCE(archived_at, SYSUTCDATETIME()),
          deleted_at = COALESCE(deleted_at, SYSUTCDATETIME()),
          deleted_by = COALESCE(deleted_by, @deletedBy),
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISITOR_ARCHIVED",
            objectType: "visitor",
            objectId: request.params.id,
            ipAddress: getRequestIp(request)
        });
        return response.json({ success: true });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besucher konnte nicht archiviert werden.");
    }
});
exports.apiRouter.post("/api/admin/retention/cleanup", async (request, response) => {
    const user = await requireRole(request, response, ["admin"]);
    if (!user)
        return;
    try {
        const pool = await (0, db_1.getPool)();
        const retention = await getRetentionSettings();
        if (!retention.enabled || !retention.days) {
            return response.json({
                success: true,
                deletedCount: 0
            });
        }
        const cancelled = await pool.request()
            .input("retentionDays", mssql_1.default.Int, retention.days)
            .input("cancelledBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.visits
        SET
          status = CASE WHEN status IN ('${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}', '${visitWorkflow_1.VISIT_STATUS.CANCELLED}') THEN status ELSE '${visitWorkflow_1.VISIT_STATUS.CANCELLED}' END,
          cancelled_at = CASE WHEN cancelled_at IS NULL THEN SYSUTCDATETIME() ELSE cancelled_at END,
          cancelled_by = CASE WHEN cancelled_by IS NULL THEN @cancelledBy ELSE cancelled_by END,
          cancel_reason = CASE WHEN cancel_reason IS NULL AND status <> '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}' THEN 'Retention cleanup' ELSE cancel_reason END,
          updated_at = SYSUTCDATETIME()
        WHERE created_at < DATEADD(day, -@retentionDays, SYSUTCDATETIME())
      `);
        await pool.request()
            .input("retentionDays", mssql_1.default.Int, retention.days)
            .input("deletedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.visitors
        SET
          is_deleted = 1,
          archived_at = COALESCE(archived_at, SYSUTCDATETIME()),
          deleted_at = COALESCE(deleted_at, SYSUTCDATETIME()),
          deleted_by = COALESCE(deleted_by, @deletedBy),
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        WHERE id IN (
          SELECT DISTINCT visitor_id
          FROM dbo.visits
          WHERE created_at < DATEADD(day, -@retentionDays, SYSUTCDATETIME())
        )
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "SYSTEM_RETENTION_CLEANUP",
            objectType: "visit",
            objectId: "bulk",
            ipAddress: getRequestIp(request)
        });
        return response.json({
            success: true,
            deletedCount: cancelled.rowsAffected[0] ?? 0
        });
    }
    catch (error) {
        return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Bereinigung konnte nicht ausgefuehrt werden.");
    }
});

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
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const multer_1 = __importStar(require("multer"));
const zod_1 = require("zod");
const authSession_1 = require("../lib/authSession");
const importTemplateFiles_1 = require("../lib/importTemplateFiles");
const publicPreRegistrations_1 = require("../lib/publicPreRegistrations");
const publicPreRegistrationSchema_1 = require("../lib/publicPreRegistrationSchema");
const rateLimit_1 = require("../lib/rateLimit");
const users_1 = require("../lib/users");
const visitImport_1 = require("../lib/visitImport");
const shared_1 = require("./shared");
const admin_1 = require("./admin");
const guard_1 = require("./guard");
const sibe_1 = require("./sibe");
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1),
    password: zod_1.z.string().min(1),
    gateId: zod_1.z.string().uuid().optional().or(zod_1.z.literal(""))
});
const publicGroupPreRegistrationSchema = zod_1.z.object({
    gateId: zod_1.z.string().uuid().optional().or(zod_1.z.literal("")),
    hostName: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    hostEmail: zod_1.z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(zod_1.z.literal("")),
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
        birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        phone: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        email: zod_1.z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
        licensePlate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        idDocumentType: zod_1.z.enum(["identity_card", "passport", "other"]).optional().or(zod_1.z.literal("")),
        idDocumentValidUntil: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        idDocumentNumber: zod_1.z.string().trim().optional().or(zod_1.z.literal(""))
    })).min(1).max(50)
});
exports.apiRouter = (0, express_1.Router)();
const publicVisitorImportUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
});
exports.apiRouter.get("/api/meta", (_request, response) => {
    response.json({
        modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
        status: "active"
    });
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
                        : menuAccess.includes("texte")
                            ? "/kaskdt/texte"
                            : "/import";
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
            fallbackGateId: parsed.data.gateId || null
        });
        return response.status(201).json({
            message: `${created.imported} Besucher wurden als Voranmeldung gespeichert.`,
            ...created
        });
    }
    catch (error) {
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
    return publicVisitorImportUpload.single("file")(request, response, async (error) => {
        if (error) {
            if (error instanceof multer_1.MulterError && error.code === "LIMIT_FILE_SIZE") {
                return (0, shared_1.sendError)(response, 400, "FILE_TOO_LARGE", "Die Importdatei ist groesser als 5 MB.");
            }
            return (0, shared_1.sendError)(response, 400, "UPLOAD_ERROR", "Die Importdatei konnte nicht gelesen werden.");
        }
        const file = request.file;
        if (!file) {
            return (0, shared_1.sendValidationError)(response, { fieldErrors: { file: ["Bitte CSV- oder Excel-Datei auswaehlen."] } });
        }
        try {
            const extension = file.originalname.toLowerCase().split(".").pop() || "";
            const rows = extension === "xlsx" || extension === "xls"
                ? (0, visitImport_1.parseExcelBuffer)(file.buffer)
                : (0, visitImport_1.parseCsvBuffer)(file.buffer);
            if (rows.length === 0) {
                return (0, shared_1.sendValidationError)(response, { fieldErrors: { file: ["Keine importierbaren Zeilen gefunden."] } });
            }
            if (rows.length > 250) {
                return (0, shared_1.sendError)(response, 400, "VALIDATION_ERROR", "Bitte maximal 250 Besucher pro Datei importieren.");
            }
            const imported = await (0, visitImport_1.createImportedPreRegistrations)(rows, {
                source: "file_import",
                createdBy: null,
                submittedIpAddress: request.ip || request.socket.remoteAddress || null,
                userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
                fallbackGateId: null
            });
            return response.status(201).json({
                message: `${imported.imported} Besucher importiert.`,
                ...imported
            });
        }
        catch (importError) {
            return (0, shared_1.handleUnexpectedError)(response, importError, "IMPORT_ERROR", "Der Besucherimport konnte nicht verarbeitet werden.");
        }
    });
});
exports.apiRouter.get("/api/public/visits/import-template.csv", (_request, response) => {
    const csv = `\uFEFF${(0, importTemplateFiles_1.buildImportTemplateCsv)()}`;
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="besucher-import-vorlage.csv"');
    return response.status(200).send(csv);
});
exports.apiRouter.get("/api/public/visits/import-template.xlsx", async (_request, response) => {
    const workbookBuffer = await (0, importTemplateFiles_1.buildImportTemplateWorkbookBuffer)();
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", 'attachment; filename="besucher-import-vorlage.xlsx"');
    return response.status(200).send(workbookBuffer);
});
exports.apiRouter.post("/api/auth/logout", async (_request, response) => {
    (0, authSession_1.clearSessionCookie)(response);
    response.json({ success: true });
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
    const rateLimitDecision = (0, rateLimit_1.checkRateLimit)(rateLimitKey, 20, 60);
    if (!rateLimitDecision.allowed) {
        response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
        return response.status(429).json({
            error: "RATE_LIMITED",
            message: "Zu viele Anfragen. Bitte spaeter erneut versuchen."
        });
    }
    const parsed = publicPreRegistrationSchema_1.publicPreRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
        return (0, shared_1.sendValidationError)(response, parsed.error.flatten());
    }
    try {
        const created = await (0, publicPreRegistrations_1.createPreRegistration)({
            ...parsed.data,
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

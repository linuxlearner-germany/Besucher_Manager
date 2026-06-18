"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const authSession_1 = require("../lib/authSession");
const publicPreRegistrations_1 = require("../lib/publicPreRegistrations");
const publicPreRegistrationSchema_1 = require("../lib/publicPreRegistrationSchema");
const rateLimit_1 = require("../lib/rateLimit");
const users_1 = require("../lib/users");
const shared_1 = require("./shared");
const admin_1 = require("./admin");
const guard_1 = require("./guard");
const sibe_1 = require("./sibe");
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(1),
    password: zod_1.z.string().min(1)
});
exports.apiRouter = (0, express_1.Router)();
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
        (0, authSession_1.setSessionCookie)(response, {
            id: candidate.id,
            username: candidate.username,
            role: candidate.role,
            gateId: candidate.gateId
        });
        return response.json({
            user: {
                id: candidate.id,
                username: candidate.username,
                displayName: candidate.username,
                role: candidate.role,
                gateId: candidate.gateId,
                gateName: null
            }
        });
    }
    catch (error) {
        return (0, shared_1.handleUnexpectedError)(response, error, "DATABASE_ERROR", "Anmeldung fehlgeschlagen.");
    }
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

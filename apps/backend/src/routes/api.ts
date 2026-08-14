import { Router } from "express";
import { z } from "zod";
import { COUNTRIES, normalizeCountryCode } from "../lib/countries";
import { env } from "../config/env";
import { clearSessionCookie, setSessionCookie } from "../lib/authSession";
import { createPreRegistration, findActiveGateById, listActiveGates } from "../lib/publicPreRegistrations";
import {
  createPublicPreRegistrationSchema,
  PUBLIC_FIELD_INPUT_MAP,
  type PublicFieldKey
} from "../lib/publicPreRegistrationSchema";
import { listFieldDefinitions } from "../lib/fieldDefinitions";
import { checkRateLimit } from "../lib/rateLimit";
import { findUserById, findUserForLogin, hashPassword, verifyPassword } from "../lib/users";
import { ImportValidationError, createImportedPreRegistrations } from "../lib/visitImport";
import { loadWorkflowSettings } from "../lib/systemSettings";
import { APP_VERSION } from "../lib/appVersion";
import {
  getRequestIp,
  getRequestUserAgent,
  handleUnexpectedError,
  issueCsrfToken,
  requireAuthenticatedUser,
  resolveAuthenticatedUser,
  sendError,
  sendValidationError
} from "./shared";
import { writeAuditLog } from "../lib/auditLog";
import { getPool } from "../lib/db";
import sql from "mssql";
import { handleVisitorImportUpload, sendVisitorImportTemplateWorkbook } from "./visitorImport";
import { adminRouter } from "./admin";
import { guardRouter } from "./guard";
import { sibeRouter } from "./sibe";
import { publicSimplifiedApplicationsRouter } from "./publicSimplifiedApplications";
import { bundeswehrEmailSchema } from "../lib/emailPolicy";
import { sendGroupPreRegistrationConfirmation } from "../lib/mailRelay";
import {
  getPublicPreRegistration,
  hashPublicAccessToken,
  isPlausiblePublicAccessToken,
  PublicAccessError,
  publicPreRegistrationUpdateSchema,
  updatePublicPreRegistration
} from "../lib/publicPreRegistrationAccess";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  gateId: z.string().uuid().optional().or(z.literal(""))
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(1)
}).superRefine((value, context) => {
  if (value.newPassword !== value.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Die Passwortbestätigung stimmt nicht überein."
    });
  }

  if (value.currentPassword === value.newPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["newPassword"],
      message: "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden."
    });
  }
});
const publicGroupPreRegistrationSchema = z.object({
  gateId: z.string().uuid("Bitte eine Wache auswählen."),
  hostName: z.string().trim().optional().or(z.literal("")),
  hostEmail: bundeswehrEmailSchema,
  hostPhone: z.string().trim().optional().or(z.literal("")),
  hostDepartment: z.string().trim().optional().or(z.literal("")),
  purpose: z.string().trim().optional().or(z.literal("")),
  validFrom: z.string().trim().optional().or(z.literal("")),
  validUntil: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  visitors: z.array(z.object({
    firstName: z.string().trim().optional().or(z.literal("")),
    lastName: z.string().trim().optional().or(z.literal("")),
    company: z.string().trim().optional().or(z.literal("")),
    nationalityCode: z.string().trim().transform((value, context) => {
      const code = normalizeCountryCode(value);
      if (!code) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
        return z.NEVER;
      }
      return code;
    }),
    birthDate: z.string().trim().optional().or(z.literal("")),
    visitorStreet: z.string().trim().max(255).optional().or(z.literal("")),
    visitorHouseNumber: z.string().trim().max(40).optional().or(z.literal("")),
    visitorPostalCode: z.string().trim().max(20).optional().or(z.literal("")),
    visitorCity: z.string().trim().max(120).optional().or(z.literal("")),
    phone: z.string().trim().optional().or(z.literal("")),
    email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional().or(z.literal("")),
    idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")),
    idDocumentValidUntil: z.string().trim().optional().or(z.literal("")),
    idDocumentNumber: z.string().trim().optional().or(z.literal(""))
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
} as const;
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
} as const;

export const apiRouter = Router();

function setPublicConfirmationSecurityHeaders(response: import("express").Response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function getPublicConfirmationToken(request: import("express").Request): string {
  const value = request.get("x-confirmation-token");
  return typeof value === "string" ? value.trim() : "";
}

function sendPublicAccessError(response: import("express").Response, error: PublicAccessError) {
  if (error.reason === "not_found") {
    return sendError(response, 404, "PUBLIC_CONFIRMATION_NOT_FOUND", "Dieser Bestätigungslink ist ungültig.");
  }
  if (error.reason === "expired") {
    return sendError(response, 410, "PUBLIC_CONFIRMATION_EXPIRED", "Dieser Bestätigungslink ist nicht mehr gültig.");
  }
  if (error.reason === "revoked") {
    return sendError(response, 410, "PUBLIC_CONFIRMATION_REVOKED", "Diese Voranmeldung wurde widerrufen oder ist nicht mehr verfügbar.");
  }
  if (error.reason === "conflict") {
    return sendError(response, 409, "PUBLIC_CONFIRMATION_CONFLICT", "Die Voranmeldung wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.");
  }
  return sendError(response, 409, "PUBLIC_CONFIRMATION_NOT_EDITABLE", "Diese Voranmeldung kann nicht mehr geändert werden.");
}

function publicConfirmationRateLimitKey(request: import("express").Request, token: string, operation: "read" | "update") {
  const fingerprint = isPlausiblePublicAccessToken(token) ? hashPublicAccessToken(token).slice(0, 16) : "invalid";
  return `public-confirmation:${operation}:${getRequestIp(request)}:${fingerprint}`;
}

apiRouter.get("/api/meta", (_request, response) => {
  response.json({
    version: APP_VERSION,
    modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
    status: "active"
  });
});

apiRouter.get("/api/countries", (_request, response) => {
  response.json({ countries: COUNTRIES });
});

apiRouter.get("/api/ui-settings", async (_request, response) => {
  try {
    const settings = await loadWorkflowSettings();
    return response.json({
      backgroundMode: settings.backgroundMode,
      backgroundImageUrl: settings.backgroundImageUrl,
      securityNumber: settings.securityNumber
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Oberflaecheneinstellungen konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/public/pre-registration-confirmation", async (request, response) => {
  setPublicConfirmationSecurityHeaders(response);
  const token = getPublicConfirmationToken(request);
  const decision = checkRateLimit(publicConfirmationRateLimitKey(request, token, "read"), 60, 60);
  if (!decision.allowed) {
    response.setHeader("Retry-After", String(decision.retryAfterSeconds));
    return sendError(response, 429, "RATE_LIMITED", "Zu viele Zugriffsversuche. Bitte warten Sie einen Moment.");
  }
  try {
    const preRegistration = await getPublicPreRegistration(token);
    return response.json({ preRegistration });
  } catch (error) {
    if (error instanceof PublicAccessError) return sendPublicAccessError(response, error);
    return handleUnexpectedError(response, error, "PUBLIC_CONFIRMATION_READ_FAILED", "Die Voranmeldung konnte nicht geladen werden.");
  }
});

apiRouter.patch("/api/public/pre-registration-confirmation", async (request, response) => {
  setPublicConfirmationSecurityHeaders(response);
  const token = getPublicConfirmationToken(request);
  const decision = checkRateLimit(publicConfirmationRateLimitKey(request, token, "update"), 15, 60);
  if (!decision.allowed) {
    response.setHeader("Retry-After", String(decision.retryAfterSeconds));
    return sendError(response, 429, "RATE_LIMITED", "Zu viele Änderungsversuche. Bitte warten Sie einen Moment.");
  }
  const parsed = publicPreRegistrationUpdateSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  try {
    const preRegistration = await updatePublicPreRegistration(token, parsed.data, {
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });
    return response.json({ message: "Ihre Änderungen wurden erfolgreich gespeichert.", preRegistration });
  } catch (error) {
    if (error instanceof PublicAccessError) return sendPublicAccessError(response, error);
    return handleUnexpectedError(response, error, "PUBLIC_CONFIRMATION_UPDATE_FAILED", "Ihre Änderungen konnten nicht gespeichert werden.");
  }
});

apiRouter.get("/api/auth/me", async (request, response) => {
  const user = await resolveAuthenticatedUser(request);

  if (!user) {
    return response.json({
      user: null
    });
  }

  return response.json({
    user
  });
});

apiRouter.post("/api/auth/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const candidate = await findUserForLogin(parsed.data.username);
    if (!candidate || !candidate.isActive) {
      return sendError(response, 401, "INVALID_CREDENTIALS", "Benutzername oder Passwort ist ungueltig.");
    }

    const passwordMatches = await verifyPassword(parsed.data.password, candidate.passwordHash);
    if (!passwordMatches) {
      return sendError(response, 401, "INVALID_CREDENTIALS", "Benutzername oder Passwort ist ungueltig.");
    }

    let activeGateId = candidate.gateId;
    let activeGateName: string | null = null;

    if (candidate.role === "guard") {
      const requestedGateId = parsed.data.gateId?.trim() || "";

      if (!requestedGateId) {
        const gates = await listActiveGates();
        return response.json({
          requiresGateSelection: true,
          gates
        });
      }

      const selectedGate = await findActiveGateById(requestedGateId);

      if (!selectedGate) {
        return sendError(response, 400, "INVALID_GATE", "Die ausgewaehlte Wache ist nicht verfuegbar.");
      }

      activeGateId = selectedGate.id;
      activeGateName = selectedGate.name;
    } else if (candidate.gateId) {
      const gate = await findActiveGateById(candidate.gateId);
      activeGateName = gate?.name ?? null;
    }
    const redirectTo = candidate.role === "admin"
      ? "/admin"
      : candidate.role === "guard"
        ? "/wache"
        : candidate.role === "kaskdt"
          ? "/kaskdt"
          : "/sibe";

    setSessionCookie(response, {
      id: candidate.id,
      username: candidate.username,
      role: candidate.role,
      roles: candidate.roles,
      gateId: activeGateId
    });

    const fullUser = await findUserById(candidate.id);
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

    await writeAuditLog({
      user: candidate.username,
      userId: candidate.id,
      action: "USER_LOGIN_SUCCEEDED",
      objectType: "user",
      objectId: candidate.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        requestId: request.requestId ?? null,
        httpMethod: request.method,
        endpoint: request.originalUrl,
        httpStatus: 200,
        result: "success",
        source: "authentication",
        roles: fullUser?.roles ?? candidate.roles,
        gateId: activeGateId
      }
    });

    return response.json({
      user: {
        id: candidate.id,
        username: candidate.username,
        displayName: candidate.username,
        role: candidate.role,
        roles: fullUser?.roles ?? candidate.roles,
        gateId: activeGateId,
        gateName: activeGateName,
        groups: fullUser?.groups ?? [],
        menuAccess,
        permissions: fullUser?.permissions
      },
      redirectTo: redirectTarget || redirectTo
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Anmeldung fehlgeschlagen.");
  }
});

apiRouter.post("/api/auth/gate", async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;
  const parsed = z.object({ gateId: z.string().uuid() }).safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const gate = await findActiveGateById(parsed.data.gateId);
  if (!gate) return sendError(response, 400, "INVALID_GATE", "Die ausgewählte Wache ist nicht verfügbar.");
  setSessionCookie(response, { id: user.id, username: user.username, role: user.role, roles: user.roles, gateId: gate.id });
  return response.json({ success: true, gateId: gate.id, gateName: gate.name });
});

apiRouter.post("/api/public/pre-registrations/group", async (request, response) => {
  const rateLimitKey = `public-group-pre-registration:${request.ip || request.socket.remoteAddress || "unknown"}`;
  const rateLimitDecision = checkRateLimit(rateLimitKey, 8, 60);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: "Zu viele Gruppenimporte. Bitte spaeter erneut versuchen."
    });
  }

  const parsed = publicGroupPreRegistrationSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const gateId = parsed.data.gateId?.trim();
    if (!gateId) {
      return sendValidationError(response, { fieldErrors: { gateId: ["Bitte eine Wache auswählen."] } });
    }

    const gate = await findActiveGateById(gateId);
    if (!gate) {
      return sendValidationError(response, { fieldErrors: { gateId: ["Die ausgewählte Wache ist nicht verfügbar."] } });
    }

    const definitions = await listFieldDefinitions("public");
    const requiredDefinitions = definitions.filter((field) => field.requiredPublic);
    const supportedKeys = new Set(Object.keys(PUBLIC_FIELD_INPUT_MAP));
    const requiredPublicFieldKeys = new Set<PublicFieldKey>(
      requiredDefinitions
        .filter((field) => supportedKeys.has(field.fieldKey))
        .map((field) => field.fieldKey as PublicFieldKey)
    );
    const missingFields: string[] = [];

    for (const field of requiredDefinitions) {
      const sharedInput = publicGroupSharedFieldMap[field.fieldKey as keyof typeof publicGroupSharedFieldMap];
      if (sharedInput && !String(parsed.data[sharedInput] ?? "").trim()) {
        missingFields.push(`${field.label} fehlt.`);
      }

      const visitorInput = publicGroupVisitorFieldMap[field.fieldKey as keyof typeof publicGroupVisitorFieldMap];
      if (visitorInput) {
        parsed.data.visitors.forEach((visitor, index) => {
          if (!String(visitor[visitorInput] ?? "").trim()) {
            missingFields.push(`Zeile ${index + 1}: ${field.label} fehlt.`);
          }
        });
      }
    }

    if (missingFields.length > 0) {
      return sendValidationError(response, { fieldErrors: { visitors: missingFields } });
    }

    const created = await createImportedPreRegistrations(
      parsed.data.visitors.map((visitor) => ({
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
      })),
      {
        source: "public_group_form",
        submittedIpAddress: request.ip || request.socket.remoteAddress || null,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
        fallbackGateId: parsed.data.gateId,
        requiredPublicFieldKeys
      }
    );
    if (parsed.data.hostEmail) {
      void sendGroupPreRegistrationConfirmation({
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
  } catch (error) {
    if (error instanceof ImportValidationError) {
      return sendValidationError(response, { fieldErrors: { visitors: error.messages } });
    }
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gruppenimport konnte nicht gespeichert werden.");
  }
});

apiRouter.post("/api/public/visits/import", async (request, response) => {
  const rateLimitKey = `public-visitor-import:${request.ip || request.socket.remoteAddress || "unknown"}`;
  const rateLimitDecision = checkRateLimit(rateLimitKey, 8, 60);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: "Zu viele Importversuche. Bitte spaeter erneut versuchen."
    });
  }

  return handleVisitorImportUpload(request, response, {
    createdBy: null,
    fallbackGateId: null
  });
});

apiRouter.get("/api/public/visits/import-template.xlsx", async (_request, response) => {
  return sendVisitorImportTemplateWorkbook(response);
});

apiRouter.post("/api/auth/logout", async (_request, response) => {
  clearSessionCookie(response);
  response.json({ success: true });
});

apiRouter.put("/api/auth/password", async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const rateLimitDecision = checkRateLimit(`password-change:${user.id}`, 5, 300);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return sendError(response, 429, "RATE_LIMITED", "Zu viele Passwortänderungsversuche. Bitte warten Sie einige Minuten.");
  }

  const parsed = passwordChangeSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, user.id)
      .query<{ passwordHash: string; isActive: boolean }>(`
        SELECT password_hash AS passwordHash, is_active AS isActive
        FROM dbo.users
        WHERE id = @id
      `);
    const account = result.recordset[0];

    if (!account?.isActive || !(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
      return sendError(response, 400, "CURRENT_PASSWORD_INVALID", "Das aktuelle Passwort ist nicht korrekt.");
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await pool.request()
      .input("id", sql.UniqueIdentifier, user.id)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query("UPDATE dbo.users SET password_hash = @passwordHash, updated_at = SYSUTCDATETIME() WHERE id = @id");

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "USER_PASSWORD_CHANGED",
      objectType: "user",
      objectId: user.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });

    return response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Passwort konnte nicht geändert werden.");
  }
});

apiRouter.get("/api/public/gates", async (_request, response) => {
  try {
    const [gates, csrfToken] = await Promise.all([
      listActiveGates(),
      issueCsrfToken(response)
    ]);

    response.json({
      gates,
      csrfToken
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Wachen konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/public/pre-registrations", async (request, response) => {
  const rateLimitKey = `public-pre-registration:${request.ip || request.socket.remoteAddress || "unknown"}`;
  const rateLimitDecision = checkRateLimit(rateLimitKey, env.PUBLIC_FORM_RATE_LIMIT, env.PUBLIC_FORM_RATE_WINDOW_SECONDS);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: `Zu viele Anfragen. Bitte in ${rateLimitDecision.retryAfterSeconds} Sekunden erneut versuchen.`,
      retryAfterSeconds: rateLimitDecision.retryAfterSeconds
    });
  }

  try {
    const definitions = await listFieldDefinitions("public");
    const supportedKeys = new Set(Object.keys(PUBLIC_FIELD_INPUT_MAP));
    const requiredKeys = new Set<PublicFieldKey>(
      definitions
        .filter((field) => field.requiredPublic && supportedKeys.has(field.fieldKey))
        .map((field) => field.fieldKey as PublicFieldKey)
    );
    const parsed = createPublicPreRegistrationSchema(requiredKeys).safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(response, parsed.error.flatten());
    }

    const gateId = parsed.data.gateId?.trim();
    if (!gateId) {
      return sendValidationError(response, { fieldErrors: { gateId: ["Bitte eine Wache auswählen."] } });
    }

    const gate = await findActiveGateById(gateId);
    if (!gate) {
      return sendValidationError(response, { fieldErrors: { gateId: ["Die ausgewählte Wache ist nicht verfügbar."] } });
    }

    const created = await createPreRegistration({
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
  }
});

apiRouter.use(publicSimplifiedApplicationsRouter);
apiRouter.use(guardRouter);
apiRouter.use(sibeRouter);
apiRouter.use(adminRouter);

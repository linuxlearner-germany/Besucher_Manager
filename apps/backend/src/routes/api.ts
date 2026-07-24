import { Router } from "express";
import { z } from "zod";
import { COUNTRIES, normalizeCountryCode } from "../lib/countries";
import { clearSessionCookie, setSessionCookie } from "../lib/authSession";
import { createPreRegistration, findActiveGateById, listActiveGates } from "../lib/publicPreRegistrations";
import {
  createPublicPreRegistrationSchema,
  PUBLIC_FIELD_INPUT_MAP,
  type PublicFieldKey
} from "../lib/publicPreRegistrationSchema";
import { listFieldDefinitions } from "../lib/fieldDefinitions";
import { checkRateLimit } from "../lib/rateLimit";
import { findUserById, findUserForLogin, verifyPassword } from "../lib/users";
import { createImportedPreRegistrations } from "../lib/visitImport";
import { loadWorkflowSettings } from "../lib/systemSettings";
import {
  handleUnexpectedError,
  issueCsrfToken,
  resolveAuthenticatedUser,
  sendError,
  sendValidationError
} from "./shared";
import { handleVisitorImportUpload, sendVisitorImportTemplateWorkbook } from "./visitorImport";
import { adminRouter } from "./admin";
import { guardRouter } from "./guard";
import { sibeRouter } from "./sibe";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  gateId: z.string().uuid().optional().or(z.literal(""))
});
const publicGroupPreRegistrationSchema = z.object({
  gateId: z.string().uuid().optional().or(z.literal("")),
  hostName: z.string().trim().optional().or(z.literal("")),
  hostEmail: z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
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
    phone: z.string().trim().optional().or(z.literal("")),
    email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional().or(z.literal("")),
    idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")),
    idDocumentValidUntil: z.string().trim().optional().or(z.literal("")),
    idDocumentNumber: z.string().trim().optional().or(z.literal(""))
  })).min(1).max(50)
});

export const apiRouter = Router();

apiRouter.get("/api/meta", (_request, response) => {
  response.json({
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
      backgroundImageUrl: settings.backgroundImageUrl
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Oberflaecheneinstellungen konnten nicht geladen werden.");
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
      return response.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Benutzername oder Passwort ist ungueltig."
      });
    }

    const passwordMatches = await verifyPassword(parsed.data.password, candidate.passwordHash);
    if (!passwordMatches) {
      return response.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Benutzername oder Passwort ist ungueltig."
      });
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
        return response.status(400).json({
          error: "INVALID_GATE",
          message: "Die ausgewaehlte Wache ist nicht verfuegbar."
        });
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Anmeldung fehlgeschlagen.");
  }
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
        fallbackGateId: parsed.data.gateId || null
      }
    );

    return response.status(201).json({
      message: `${created.imported} Besucher wurden als Voranmeldung gespeichert.`,
      ...created
    });
  } catch (error) {
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
  const rateLimitDecision = checkRateLimit(rateLimitKey, 20, 60);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: "Zu viele Anfragen. Bitte spaeter erneut versuchen."
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

    const created = await createPreRegistration({
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
  }
});

apiRouter.use(guardRouter);
apiRouter.use(sibeRouter);
apiRouter.use(adminRouter);

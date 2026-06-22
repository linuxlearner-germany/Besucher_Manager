import { Router } from "express";
import multer, { MulterError } from "multer";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie } from "../lib/authSession";
import { buildImportTemplateCsv, buildImportTemplateWorkbookBuffer } from "../lib/importTemplateFiles";
import { createPreRegistration, findActiveGateById, listActiveGates } from "../lib/publicPreRegistrations";
import { publicPreRegistrationSchema } from "../lib/publicPreRegistrationSchema";
import { checkRateLimit } from "../lib/rateLimit";
import { findUserById, findUserForLogin, verifyPassword } from "../lib/users";
import { createImportedPreRegistrations, parseCsvBuffer, parseExcelBuffer } from "../lib/visitImport";
import {
  handleUnexpectedError,
  issueCsrfToken,
  resolveAuthenticatedUser,
  sendError,
  sendValidationError
} from "./shared";
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
    birthDate: z.string().trim().optional().or(z.literal("")),
    phone: z.string().trim().optional().or(z.literal("")),
    email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional().or(z.literal("")),
    idDocumentType: z.enum(["identity_card", "passport", "other"]).optional().or(z.literal("")),
    idDocumentValidUntil: z.string().trim().optional().or(z.literal("")),
    idDocumentNumber: z.string().trim().optional().or(z.literal(""))
  })).min(1).max(50)
});

export const apiRouter = Router();
const publicVisitorImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

apiRouter.get("/api/meta", (_request, response) => {
  response.json({
    modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
    status: "active"
  });
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

  return publicVisitorImportUpload.single("file")(request, response, async (error) => {
    if (error) {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return sendError(response, 400, "FILE_TOO_LARGE", "Die Importdatei ist groesser als 5 MB.");
      }
      return sendError(response, 400, "UPLOAD_ERROR", "Die Importdatei konnte nicht gelesen werden.");
    }

    const file = request.file;
    if (!file) {
      return sendValidationError(response, { fieldErrors: { file: ["Bitte CSV- oder Excel-Datei auswaehlen."] } });
    }

    try {
      const extension = file.originalname.toLowerCase().split(".").pop() || "";
      const rows = extension === "xlsx" || extension === "xls"
        ? parseExcelBuffer(file.buffer)
        : parseCsvBuffer(file.buffer);

      if (rows.length === 0) {
        return sendValidationError(response, { fieldErrors: { file: ["Keine importierbaren Zeilen gefunden."] } });
      }
      if (rows.length > 250) {
        return sendError(response, 400, "VALIDATION_ERROR", "Bitte maximal 250 Besucher pro Datei importieren.");
      }

      const imported = await createImportedPreRegistrations(rows, {
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
    } catch (importError) {
      return handleUnexpectedError(response, importError, "IMPORT_ERROR", "Der Besucherimport konnte nicht verarbeitet werden.");
    }
  });
});

apiRouter.get("/api/public/visits/import-template.csv", (_request, response) => {
  const csv = `\uFEFF${buildImportTemplateCsv()}`;

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="besucher-import-vorlage.csv"');
  return response.status(200).send(csv);
});

apiRouter.get("/api/public/visits/import-template.xlsx", async (_request, response) => {
  const workbookBuffer = await buildImportTemplateWorkbookBuffer();

  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", 'attachment; filename="besucher-import-vorlage.xlsx"');
  return response.status(200).send(workbookBuffer);
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

  const parsed = publicPreRegistrationSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
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

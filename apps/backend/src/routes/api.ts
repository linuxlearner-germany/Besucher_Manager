import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer, { MulterError } from "multer";
import sql from "mssql";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { clearSessionCookie, getSessionCookieName, readSessionToken, setSessionCookie } from "../lib/authSession";
import { getVisitDetailForUser, getTodayVisitsForUser, getCalendarVisitsForUser, checkInVisit, checkOutVisit, updateHostSignatureForGuard, updateVisitForGuard } from "../lib/guardVisits";
import { getPool } from "../lib/db";
import { createPreRegistration, listActiveGates } from "../lib/publicPreRegistrations";
import { publicPreRegistrationSchema } from "../lib/publicPreRegistrationSchema";
import { checkRateLimit } from "../lib/rateLimit";
import {
  ALLOWED_SITE_MAP_MIME_TYPES,
  SITE_MAP_MAX_FILE_SIZE_BYTES,
  SITE_MAP_UPLOAD_SUBDIRECTORY,
  buildSiteMapPublicPath,
  buildStoredSiteMapFileName,
  getNormalizedExtension,
  isAllowedSiteMapExtension,
  isAllowedSiteMapMimeType
} from "../lib/siteMaps";
import { findUserById, findUserForLogin, hashPassword, verifyPassword } from "../lib/users";
import { HOST_SIGNATURE_STATUS, VISIT_STATUS, type AuthenticatedUser } from "../lib/visitWorkflow";
import { writeAuditLog } from "../lib/auditLog";
import { env } from "../config/env";
import { listAdminFieldDefinitions, listFieldDefinitions, updateFieldDefinition } from "../lib/fieldDefinitions";

const csrfCookieName = "visitor_manager_csrf";
const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});
const hostSignatureStatusSchema = z.enum([
  HOST_SIGNATURE_STATUS.NOT_REQUIRED,
  HOST_SIGNATURE_STATUS.PENDING,
  HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY,
  HOST_SIGNATURE_STATUS.SIGNED_LATER,
  HOST_SIGNATURE_STATUS.MISSING_EXCEPTION
]);
const checkOutSchema = z.object({
  signed_by_host_confirmed: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestaetigen Sie die Ansprechpartner-Unterschrift." })
  }),
  returned_badge_number: z.string().trim().min(1, "Bitte geben Sie die Besuchsnummer vom Besucherschein ein.").transform((value) => value.toUpperCase())
});
const signatureUpdateSchema = z.object({
  host_signature_status: hostSignatureStatusSchema,
  host_signature_date: z.string().trim().optional(),
  host_signature_note: z.string().trim().optional()
}).superRefine((value, context) => {
  if (value.host_signature_status === HOST_SIGNATURE_STATUS.SIGNED_LATER && !value.host_signature_date?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["host_signature_date"],
      message: "Bitte geben Sie das Datum der Unterschrift an."
    });
  }

  if (value.host_signature_status === HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !value.host_signature_note?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["host_signature_note"],
      message: "Bitte dokumentieren Sie die Ausnahme."
    });
  }
});
const guardVisitUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  birthDate: z.string().trim().optional().or(z.literal("")),
  company: z.string().trim().min(1).max(255),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
  licensePlate: z.string().trim().max(40).optional().or(z.literal("")),
  hostName: z.string().trim().min(1).max(255),
  hostEmail: z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
  hostPhone: z.string().trim().max(80).optional().or(z.literal("")),
  hostDepartment: z.string().trim().max(255).optional().or(z.literal("")),
  purpose: z.string().trim().min(1).max(500),
  gateId: z.string().uuid().optional().or(z.literal("")),
  validFrom: z.string().trim().min(1, "Gueltig von ist erforderlich."),
  validUntil: z.string().trim().min(1, "Gueltig bis ist erforderlich."),
  notes: z.string().trim().optional().or(z.literal("")),
  visitorStreet: z.string().trim().max(255).optional().or(z.literal("")),
  visitorHouseNumber: z.string().trim().max(40).optional().or(z.literal("")),
  visitorPostalCode: z.string().trim().max(20).optional().or(z.literal("")),
  visitorCity: z.string().trim().max(120).optional().or(z.literal("")),
  visitorAddress: z.string().trim().max(500).optional().or(z.literal("")),
  idDocumentType: z.enum(["identity_card", "passport", "other"]).optional().or(z.literal("")),
  idDocumentValidUntil: z.string().trim().optional().or(z.literal("")),
  idDocumentNumber: z.string().trim().max(120).optional().or(z.literal("")),
  idDocumentIssuingPlace: z.string().trim().max(255).optional().or(z.literal("")),
  visitPurposeType: z.enum(["private", "business"]).optional().or(z.literal("")),
  visitCompanyOrder: z.string().trim().max(500).optional().or(z.literal("")),
  hostUnit: z.string().trim().max(255).optional().or(z.literal("")),
  hostBuilding: z.string().trim().max(120).optional().or(z.literal("")),
  hostRoom: z.string().trim().max(80).optional().or(z.literal("")),
  hostExtension: z.string().trim().max(80).optional().or(z.literal("")),
  visitEndType: z.enum(["ended", "forwarded"]).optional().or(z.literal("")),
  forwardedToNote: z.string().trim().max(500).optional().or(z.literal("")),
  devicePhotoApp: z.boolean().optional(),
  deviceFilmApp: z.boolean().optional(),
  deviceVideoCamera: z.boolean().optional(),
  deviceManufacturer: z.string().trim().max(255).optional().or(z.literal("")),
  deviceSerialNumber: z.string().trim().max(120).optional().or(z.literal("")),
  deviceAccessories: z.string().trim().max(500).optional().or(z.literal("")),
  deviceDepositNote: z.string().trim().max(500).optional().or(z.literal("")),
  deviceReturnConfirmed: z.boolean().optional(),
  deviceReturnedAt: z.string().trim().optional().or(z.literal(""))
}).superRefine((value, context) => {
  const validFrom = new Date(value.validFrom);
  const validUntil = new Date(value.validUntil);
  if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Gueltig bis darf nicht vor Gueltig von liegen."
    });
  }
  if (value.birthDate) {
    const birthDate = new Date(value.birthDate);
    if (Number.isNaN(birthDate.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "Ungueltiges Geburtsdatum."
      });
    } else if (birthDate > new Date()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "Geburtsdatum darf nicht in der Zukunft liegen."
      });
    }
  }

  if (value.idDocumentValidUntil) {
    const date = new Date(value.idDocumentValidUntil);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idDocumentValidUntil"],
        message: "Ungueltiges Ausweisdatum."
      });
    }
  }

  if (value.deviceReturnedAt) {
    const date = new Date(value.deviceReturnedAt);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deviceReturnedAt"],
        message: "Ungueltiges Rueckgabe-Datum."
      });
    }
  }
});
const gateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  location: z.string().trim().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});
const gateUpdateSchema = gateCreateSchema.partial();
const userCreateSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "guard", "sibe"]),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
}).superRefine((value, context) => {
  if (value.role === "guard" && !value.gateId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gateId"],
      message: "Fuer Guard-Benutzer ist eine Wache erforderlich."
    });
  }
});
const userUpdateSchema = z.object({
  username: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["admin", "guard", "sibe"]).optional(),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});
const visitCancelSchema = z.object({
  cancel_reason: z.string().trim().min(1).max(500)
});
const guardCalendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().optional(),
  search: z.string().optional()
}).superRefine((value, context) => {
  const from = new Date(`${value.from}T00:00:00.000Z`);
  const to = new Date(`${value.to}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "Ungueltiger Datumsbereich." });
    return;
  }
  if (to < from) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Bis-Datum muss nach Von-Datum liegen." });
  }
  const diffDays = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Datumsbereich darf maximal 90 Tage umfassen." });
  }
});
const fieldDefinitionsContextSchema = z.enum(["public", "guard", "sibe", "badge", "admin"]);
const adminFieldDefinitionUpdateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  section: z.string().trim().min(1).max(50),
  isActive: z.boolean(),
  showInPublic: z.boolean(),
  showInGuard: z.boolean(),
  showInSibe: z.boolean(),
  showOnBadge: z.boolean(),
  requiredPublic: z.boolean(),
  requiredGuardCheckin: z.boolean(),
  requiredBeforePrint: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  helpText: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  optionsJson: z.string().trim().optional().nullable().or(z.literal(""))
}).superRefine((value, context) => {
  if (!value.showInPublic && value.requiredPublic) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiredPublic"],
      message: "Ein Feld kann nur Pflicht sein, wenn es im Kontext sichtbar ist."
    });
  }
  if (!value.showInGuard && (value.requiredGuardCheckin || value.requiredBeforePrint)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiredGuardCheckin"],
      message: "Ein Feld kann nur Pflicht sein, wenn es im Guard-Kontext sichtbar ist."
    });
  }
});
const fieldDefinitionKeySchema = z.string().trim().regex(/^[a-z][a-z0-9_]{1,99}$/, "Ungueltiger fieldKey.");
const allowedFieldTypes = ["text", "textarea", "date", "email", "phone", "select", "checkbox", "number"] as const;
const allowedSections = ["Besucher", "Adresse", "Ansprechpartner", "Besuch", "Ausweis", "Ziel/Raum", "Geraete", "Sonstiges"] as const;
const adminFieldDefinitionCreateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  fieldType: z.enum(allowedFieldTypes),
  section: z.enum(allowedSections),
  isActive: z.boolean().optional().default(true),
  showInPublic: z.boolean().optional().default(false),
  showInGuard: z.boolean().optional().default(true),
  showInSibe: z.boolean().optional().default(true),
  showOnBadge: z.boolean().optional().default(false),
  requiredPublic: z.boolean().optional().default(false),
  requiredGuardCheckin: z.boolean().optional().default(false),
  requiredBeforePrint: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(9999).optional().default(100),
  helpText: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  optionsJson: z.string().trim().max(8000).optional().nullable().or(z.literal("")),
  fieldKey: fieldDefinitionKeySchema.optional()
});
const fieldConfigImportFieldSchema = z.object({
  fieldKey: fieldDefinitionKeySchema,
  label: z.string().trim().min(1).max(200),
  fieldType: z.enum(allowedFieldTypes),
  section: z.enum(allowedSections),
  isSystem: z.boolean().optional().default(false),
  isActive: z.boolean(),
  showInPublic: z.boolean(),
  showInGuard: z.boolean(),
  showInSibe: z.boolean(),
  showOnBadge: z.boolean(),
  requiredPublic: z.boolean(),
  requiredGuardCheckin: z.boolean(),
  requiredBeforePrint: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  helpText: z.string().trim().max(500).nullable().optional(),
  options: z.unknown().nullable().optional()
}).superRefine((value, context) => {
  if (!value.showInPublic && value.requiredPublic) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredPublic"], message: "requiredPublic erfordert showInPublic=true." });
  }
  if (!value.showInGuard && (value.requiredGuardCheckin || value.requiredBeforePrint)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredGuardCheckin"], message: "Guard-Pflichten erfordern showInGuard=true." });
  }
});
const fieldConfigImportSchema = z.object({
  schema: z.literal("besucher-manager-field-config"),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  app: z.string().optional(),
  fields: z.array(fieldConfigImportFieldSchema).min(1)
});
const badgeTextUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  textType: z.enum(["security_notice", "photo_ban", "signature_notice", "footer"]),
  content: z.string().trim().min(1),
  isActive: z.boolean().optional()
});
const badgeTextCreateSchema = badgeTextUpdateSchema;
const siteMapUploadNameSchema = z.object({
  name: z.string().trim().min(1).max(255).optional()
});
const retentionSettingsSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().positive().max(3650).optional()
});

export const apiRouter = Router();

type SiteMapRow = {
  id: string;
  name: string;
  filePath: string;
  originalFileName: string | null;
  storedFileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  uploadedBy: string | null;
};

const siteMapUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: SITE_MAP_MAX_FILE_SIZE_BYTES,
    files: 1
  },
  fileFilter: (_request, file, callback) => {
    const extension = getNormalizedExtension(file.originalname);

    if (!extension || !isAllowedSiteMapExtension(extension) || !isAllowedSiteMapMimeType(file.mimetype)) {
      callback(new Error("invalid_site_map_file"));
      return;
    }

    callback(null, true);
  }
});

function isSchemaMissingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Invalid object name");
}

function issueCsrfToken(response: Response, currentToken?: string): string {
  const token = currentToken || crypto.randomUUID();

  response.cookie(csrfCookieName, token, {
    signed: true,
    sameSite: "strict",
    secure: env.APP_SECURE_COOKIES,
    httpOnly: true
  });

  return token;
}

function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function getRequestUserAgent(request: Request): string | null {
  return request.get("user-agent") || null;
}

function sendError(
  response: Response,
  status: number,
  error: string,
  message: string,
  details?: unknown
) {
  return response.status(status).json({
    error,
    message,
    ...(details !== undefined ? { details } : {})
  });
}

function sendValidationError(response: Response, details?: unknown) {
  return sendError(response, 400, "VALIDATION_ERROR", "Bitte pruefen Sie die eingegebenen Daten.", details);
}

function sendForbidden(response: Response) {
  return sendError(response, 403, "FORBIDDEN", "Nicht ausreichend berechtigt.");
}

function sendAuthRequired(response: Response) {
  return sendError(response, 401, "UNAUTHORIZED", "Anmeldung erforderlich.");
}

function handleUnexpectedError(
  response: Response,
  error: unknown,
  fallbackErrorCode: string,
  fallbackMessage: string
) {
  console.error(error);
  return sendError(response, 500, fallbackErrorCode, fallbackMessage);
}

function buildFieldKeyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

function normalizeImportOptions(options: unknown): string | null {
  if (options === null || options === undefined) {
    return null;
  }
  if (Array.isArray(options)) {
    return JSON.stringify(options);
  }
  if (typeof options === "string") {
    const value = options.trim();
    return value || null;
  }
  if (typeof options === "object") {
    return JSON.stringify(options);
  }
  return null;
}

async function parseSingleSiteMapUpload(request: Request, response: Response): Promise<Express.Multer.File | null> {
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

      if (error instanceof MulterError) {
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

async function ensureSiteMapUploadDirectory(): Promise<string> {
  const uploadDirectory = path.join(env.uploadDir, SITE_MAP_UPLOAD_SUBDIRECTORY);
  await fs.mkdir(uploadDirectory, { recursive: true });
  return uploadDirectory;
}

async function listSiteMaps(): Promise<SiteMapRow[]> {
  const pool = await getPool();
  const result = await pool.request().query<SiteMapRow>(`
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

async function getActiveSiteMap(): Promise<SiteMapRow | null> {
  const maps = await listSiteMaps();
  return maps.find((entry) => entry.isActive) ?? null;
}

async function deactivateSiteMaps(
  user: AuthenticatedUser,
  request: Request,
  ids: string[]
): Promise<void> {
  for (const id of ids) {
    await writeAuditLog({
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

async function activateSiteMapById(
  user: AuthenticatedUser,
  request: Request,
  siteMapId: string
): Promise<void> {
  const pool = await getPool();
  const activeBefore = await pool.request()
    .input("id", sql.UniqueIdentifier, siteMapId)
    .query<{ id: string }>(`
      SELECT id
      FROM dbo.site_maps
      WHERE is_active = 1 AND id <> @id
    `);

  await pool.request()
    .input("id", sql.UniqueIdentifier, siteMapId)
    .input("deactivatedBy", sql.UniqueIdentifier, user.id)
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
    .input("id", sql.UniqueIdentifier, siteMapId)
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
  await writeAuditLog({
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
  const pool = await getPool();
  const configured = await pool.request()
    .input("key", sql.NVarChar(120), "visitor_retention_days")
    .query<{ value: string }>("SELECT [value] AS value FROM dbo.system_settings WHERE [key] = @key");

  const raw = configured.recordset[0]?.value?.trim();

  if (!raw) {
    return {
      enabled: true,
      days: env.VISITOR_RETENTION_DAYS
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
      days: env.VISITOR_RETENTION_DAYS
    };
  }

  return {
    enabled: true,
    days: parsed
  };
}

async function resolveAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  if (request.auth !== undefined) {
    return request.auth;
  }

  const token = request.cookies?.[getSessionCookieName()];
  const sessionUser = readSessionToken(token);

  if (!sessionUser) {
    request.auth = null;
    return null;
  }

  const currentUser = await findUserById(sessionUser.id);
  request.auth = currentUser;
  return currentUser;
}

async function requireAuthenticatedUser(request: Request, response: Response): Promise<AuthenticatedUser | null> {
  const user = await resolveAuthenticatedUser(request);

  if (!user) {
    sendAuthRequired(response);
    return null;
  }

  return user;
}

async function requireRole(
  request: Request,
  response: Response,
  allowedRoles: Array<AuthenticatedUser["role"]>
): Promise<AuthenticatedUser | null> {
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
      authenticated: false
    });
  }

  return response.json({
    authenticated: true,
    user
  });
});

apiRouter.post("/api/auth/login", async (request, response) => {
  const result = loginSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  const candidate = await findUserForLogin(result.data.username);

  if (!candidate || !candidate.isActive) {
    return response.status(401).json({
      error: "UNAUTHORIZED",
      message: "Benutzername oder Passwort ist falsch."
    });
  }

  const passwordMatches = await verifyPassword(result.data.password, candidate.passwordHash);

  if (!passwordMatches) {
    return response.status(401).json({
      error: "UNAUTHORIZED",
      message: "Benutzername oder Passwort ist falsch."
    });
  }

  const user: AuthenticatedUser = {
    id: candidate.id,
    username: candidate.username,
    role: candidate.role,
    gateId: candidate.gateId
  };

  setSessionCookie(response, user);
  await getPool().then((pool) =>
    pool.request()
      .input("id", sql.UniqueIdentifier, user.id)
      .query("UPDATE dbo.users SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id")
  );
  await writeAuditLog({
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

apiRouter.post("/api/auth/logout", async (request, response) => {
  const user = await resolveAuthenticatedUser(request);
  clearSessionCookie(response);

  if (user) {
    await writeAuditLog({
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

apiRouter.get("/api/public/gates", async (request, response) => {
  try {
    const gates = await listActiveGates();
    const csrfToken = issueCsrfToken(response, request.signedCookies?.[csrfCookieName] as string | undefined);
    return response.json({ gates, csrfToken });
  } catch (error) {
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

apiRouter.post("/api/public/pre-registrations", async (request, response) => {
  const csrfCookieToken = request.signedCookies?.[csrfCookieName];
  const csrfHeaderToken = request.header("x-csrf-token");

  if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
    return sendError(response, 403, "FORBIDDEN", "Die Formularsitzung ist abgelaufen.");
  }

  const ipAddress = getRequestIp(request);
  const rateLimit = checkRateLimit(
    `public-pre-registration:${ipAddress}`,
    env.PUBLIC_FORM_RATE_LIMIT,
    env.PUBLIC_FORM_RATE_WINDOW_SECONDS
  );

  response.setHeader("X-RateLimit-Limit", env.PUBLIC_FORM_RATE_LIMIT.toString());
  response.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());

  if (!rateLimit.allowed) {
    response.setHeader("Retry-After", rateLimit.retryAfterSeconds.toString());
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: "Zu viele Anfragen in kurzer Zeit.",
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
  }

  const result = publicPreRegistrationSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    const created = await createPreRegistration({
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
  }
});

apiRouter.get("/api/guard/visits/today", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    const visits = await getTodayVisitsForUser(user, {
      search: typeof request.query.search === "string" ? request.query.search : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      signatureStatus: typeof request.query.signatureStatus === "string" ? request.query.signatureStatus : undefined
    });

    return response.json({ visits });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Tagesuebersicht konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/guard/visits/calendar", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);
  if (!user) return;

  const parsed = guardCalendarQuerySchema.safeParse({
    from: request.query.from,
    to: request.query.to,
    status: typeof request.query.status === "string" ? request.query.status : undefined,
    search: typeof request.query.search === "string" ? request.query.search : undefined
  });
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const from = `${parsed.data.from}T00:00:00.000Z`;
    const toExclusiveDate = new Date(`${parsed.data.to}T00:00:00.000Z`);
    toExclusiveDate.setUTCDate(toExclusiveDate.getUTCDate() + 1);
    const visits = await getCalendarVisitsForUser(user, {
      from,
      to: toExclusiveDate.toISOString(),
      status: parsed.data.status,
      search: parsed.data.search
    });
    return response.json({ items: visits });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Kalenderansicht konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/guard/visits/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    const visit = await getVisitDetailForUser(user, request.params.id);

    if (!visit) {
      return response.status(404).json({
        error: "NOT_FOUND",
        message: "Der Besuch wurde nicht gefunden."
      });
    }

    return response.json({ visit });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdaten konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/guard/visits/:id/check-in", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    await checkInVisit(user, request.params.id, getRequestIp(request), getRequestUserAgent(request));
    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_IN
    });
  } catch (error) {
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

      if (error.message === "visit_required_fields_missing") {
        return sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Vor dem Check-in muessen fehlende Pflichtdaten ergaenzt werden.",
          (error as Error & { details?: unknown }).details
        );
      }

    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-in konnte nicht gespeichert werden.");
  }
});

apiRouter.put("/api/guard/visits/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  const result = guardVisitUpdateSchema.safeParse(request.body);
  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await updateVisitForGuard(user, request.params.id, result.data, getRequestIp(request), getRequestUserAgent(request));
    return response.json({ success: true });
  } catch (error) {
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

apiRouter.post("/api/guard/visits/:id/check-out", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  const result = checkOutSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await checkOutVisit(
      user,
      request.params.id,
      result.data.returned_badge_number,
      {
        status: HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY
      },
      undefined,
      getRequestIp(request),
      getRequestUserAgent(request)
    );

    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_OUT
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
      }

      if (error.message === "returned_badge_number_mismatch") {
        return sendError(response, 400, "VALIDATION_ERROR", "Die eingegebene Besuchsnummer stimmt nicht mit diesem Besuch ueberein.");
      }

      if (error.message === "invalid_check_out_status") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht ausgecheckt werden.");
      }
    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-out konnte nicht gespeichert werden.");
  }
});

apiRouter.put("/api/guard/visits/:id/signature", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  const result = signatureUpdateSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await updateHostSignatureForGuard(
      user,
      request.params.id,
      {
        status: result.data.host_signature_status,
        signatureDate: result.data.host_signature_date,
        note: result.data.host_signature_note
      },
      getRequestIp(request),
      getRequestUserAgent(request)
    );

    return response.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
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

      if (error.message === "invalid_signature_update_status") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Unterschriftsstatus kann erst waehrend oder nach dem laufenden Besuch erfasst werden.");
      }
    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Unterschriftsstatus konnte nicht gespeichert werden.");
  }
});

apiRouter.post("/api/guard/visits/:id/print-log", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  await writeAuditLog({
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

apiRouter.post("/api/guard/visits/:id/cancel", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);
  if (!user) return;

  const parsed = visitCancelSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const pool = await getPool();
    const visitResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ gateId: string; status: string }>("SELECT gate_id AS gateId, status FROM dbo.visits WHERE id = @id");

    const visit = visitResult.recordset[0];
    if (!visit) {
      return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
    }

    if (user.role === "guard" && user.gateId !== visit.gateId) {
      return sendForbidden(response);
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("cancelledBy", sql.UniqueIdentifier, user.id)
      .input("cancelReason", sql.NVarChar(500), parsed.data.cancel_reason)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CANCELLED}',
          cancelled_at = SYSUTCDATETIME(),
          cancelled_by = @cancelledBy,
          cancel_reason = @cancelReason,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "VISIT_CANCELLED",
      objectType: "visit",
      objectId: request.params.id,
      ipAddress: getRequestIp(request)
    });

    return response.json({ success: true, status: VISIT_STATUS.CANCELLED });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besuch konnte nicht storniert werden.");
  }
});

apiRouter.get("/api/sibe/summary", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const [visitorsTotal, activeVisitors, todaysVisits, checkedInVisitors, usersTotal, activeUsers, signaturesPending, signaturesFollowUp, signaturesExceptions] = await Promise.all([
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0 AND is_active = 1"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in'"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE is_active = 1"),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE ISNULL(host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = '${HOST_SIGNATURE_STATUS.PENDING}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.SIGNED_LATER}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.MISSING_EXCEPTION}'`)
    ]);

    return response.json({
      visitorsTotal: visitorsTotal.recordset[0]?.count ?? 0,
      activeVisitors: activeVisitors.recordset[0]?.count ?? 0,
      todaysVisits: todaysVisits.recordset[0]?.count ?? 0,
      checkedInVisitors: checkedInVisitors.recordset[0]?.count ?? 0,
      usersTotal: usersTotal.recordset[0]?.count ?? 0,
      activeUsers: activeUsers.recordset[0]?.count ?? 0,
      signaturesPending: signaturesPending.recordset[0]?.count ?? 0,
      signaturesFollowUp: signaturesFollowUp.recordset[0]?.count ?? 0,
      signaturesExceptions: signaturesExceptions.recordset[0]?.count ?? 0
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die SiBe-Uebersicht konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/statistics/visits", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
  const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
  if (!from || !to) {
    return sendError(response, 400, "VALIDATION_ERROR", "Bitte Zeitraum von/bis angeben.");
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return sendError(response, 400, "VALIDATION_ERROR", "Ungueltiges Datumsformat.");
  }
  if (toDate < fromDate) {
    return sendError(response, 400, "VALIDATION_ERROR", "Zeitraum ungueltig.");
  }

  try {
    const pool = await getPool();
    const requestBuilder = pool.request()
      .input("fromDate", sql.Date, from)
      .input("toDate", sql.Date, to);

    const summaryResult = await requestBuilder.query<{
      total: number;
      preRegistered: number;
      checkedIn: number;
      checkedOut: number;
    }>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = '${VISIT_STATUS.PRE_REGISTERED}' OR status = 'vorangemeldet' THEN 1 ELSE 0 END) AS preRegistered,
        SUM(CASE WHEN status = '${VISIT_STATUS.CHECKED_IN}' OR status = 'eingecheckt' THEN 1 ELSE 0 END) AS checkedIn,
        SUM(CASE WHEN status = '${VISIT_STATUS.CHECKED_OUT}' OR status = 'ausgecheckt' THEN 1 ELSE 0 END) AS checkedOut
      FROM dbo.visits
      WHERE CAST(valid_from AS date) >= @fromDate
        AND CAST(valid_from AS date) <= @toDate
    `);

    const byDayResult = await pool.request()
      .input("fromDate", sql.Date, from)
      .input("toDate", sql.Date, to)
      .query<{ date: string; count: number }>(`
        SELECT
          CONVERT(NVARCHAR(10), CAST(valid_from AS date), 23) AS date,
          COUNT(*) AS count
        FROM dbo.visits
        WHERE CAST(valid_from AS date) >= @fromDate
          AND CAST(valid_from AS date) <= @toDate
        GROUP BY CAST(valid_from AS date)
        ORDER BY CAST(valid_from AS date) ASC
      `);

    const summary = summaryResult.recordset[0] ?? { total: 0, preRegistered: 0, checkedIn: 0, checkedOut: 0 };
    return response.json({
      summary: {
        total: Number(summary.total || 0),
        pre_registered: Number(summary.preRegistered || 0),
        checked_in: Number(summary.checkedIn || 0),
        checked_out: Number(summary.checkedOut || 0)
      },
      by_day: byDayResult.recordset.map((entry) => ({
        date: entry.date,
        count: Number(entry.count || 0)
      }))
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die SiBe-Statistik konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/visitors", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const company = typeof request.query.company === "string" ? request.query.company.trim() : "";
    const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
    const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
    const requestBuilder = pool.request();
    let whereClause = "v.is_deleted = 0";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      whereClause += " AND (v.first_name LIKE @search OR v.last_name LIKE @search OR v.company LIKE @search)";
    }

    if (company) {
      requestBuilder.input("company", sql.NVarChar(255), `%${company}%`);
      whereClause += " AND v.company LIKE @company";
    }

    if (from) {
      requestBuilder.input("fromDate", sql.DateTime2, new Date(from));
      whereClause += " AND EXISTS (SELECT 1 FROM dbo.visits vi_from WHERE vi_from.visitor_id = v.id AND vi_from.valid_from >= @fromDate)";
    }

    if (to) {
      requestBuilder.input("toDate", sql.DateTime2, new Date(to));
      whereClause += " AND EXISTS (SELECT 1 FROM dbo.visits vi_to WHERE vi_to.visitor_id = v.id AND vi_to.valid_from < DATEADD(day, 1, @toDate))";
    }

    const result = await requestBuilder.query<{
      id: string;
      firstName: string;
      lastName: string;
      company: string;
      birthDate: string | null;
      phone: string | null;
      email: string | null;
      archivedAt: string | null;
      visitCount: number;
      lastVisitAt: string | null;
    }>(`
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

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_VISITOR_SEARCH",
      objectType: "visitor",
      objectId: "search",
      ipAddress: getRequestIp(request)
    });

    return response.json({ visitors: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besucher konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/visits", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const status = typeof request.query.status === "string" ? request.query.status.trim() : "";
    const signatureStatus = typeof request.query.signatureStatus === "string" ? request.query.signatureStatus.trim() : "";
    const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
    const gate = typeof request.query.gate === "string" ? request.query.gate.trim() : "";
    const from = typeof request.query.from === "string"
      ? request.query.from.trim()
      : (typeof request.query.dateFrom === "string" ? request.query.dateFrom.trim() : "");
    const to = typeof request.query.to === "string"
      ? request.query.to.trim()
      : (typeof request.query.dateTo === "string" ? request.query.dateTo.trim() : "");
    const company = typeof request.query.company === "string" ? request.query.company.trim() : "";
    const hostName = typeof request.query.hostName === "string" ? request.query.hostName.trim() : "";
    const licensePlate = typeof request.query.licensePlate === "string" ? request.query.licensePlate.trim() : "";
    const badgeNumber = typeof request.query.badgeNumber === "string" ? request.query.badgeNumber.trim() : "";

    const normalizedVisitStatusSql = `
      CASE
        WHEN vt.status = 'vorangemeldet' THEN '${VISIT_STATUS.PRE_REGISTERED}'
        WHEN vt.status = 'eingecheckt' THEN '${VISIT_STATUS.CHECKED_IN}'
        WHEN vt.status = 'ausgecheckt' THEN '${VISIT_STATUS.CHECKED_OUT}'
        ELSE vt.status
      END
    `;

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
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
      if (status === "overdue") {
        conditions.push(`
          ${normalizedVisitStatusSql} IN ('${VISIT_STATUS.PRE_REGISTERED}', '${VISIT_STATUS.CHECKED_IN}')
          AND vt.valid_until < SYSUTCDATETIME()
        `);
      } else {
        requestBuilder.input("status", sql.NVarChar(32), status);
        conditions.push(`${normalizedVisitStatusSql} = @status`);
      }
    }

    if (signatureStatus && signatureStatus !== "all") {
      requestBuilder.input("signatureStatus", sql.NVarChar(40), signatureStatus);
      conditions.push(`ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = @signatureStatus`);
    }

    if (gateId) {
      requestBuilder.input("gateId", sql.UniqueIdentifier, gateId);
      conditions.push("vt.gate_id = @gateId");
    }

    if (gate) {
      requestBuilder.input("gate", sql.NVarChar(255), `%${gate}%`);
      conditions.push("g.name LIKE @gate");
    }

    if (company) {
      requestBuilder.input("company", sql.NVarChar(255), `%${company}%`);
      conditions.push("vis.company LIKE @company");
    }

    if (hostName) {
      requestBuilder.input("hostName", sql.NVarChar(255), `%${hostName}%`);
      conditions.push("vt.host_name LIKE @hostName");
    }

    if (licensePlate) {
      requestBuilder.input("licensePlate", sql.NVarChar(80), `%${licensePlate}%`);
      conditions.push("ISNULL(vt.license_plate, '') LIKE @licensePlate");
    }

    if (badgeNumber) {
      requestBuilder.input("badgeNumber", sql.NVarChar(80), `%${badgeNumber}%`);
      conditions.push("ISNULL(vt.badge_number, '') LIKE @badgeNumber");
    }

    if (from) {
      requestBuilder.input("dateFrom", sql.DateTime2, new Date(from));
      conditions.push("vt.valid_from >= @dateFrom");
    }

    if (to) {
      requestBuilder.input("dateTo", sql.DateTime2, new Date(to));
      conditions.push("vt.valid_until < DATEADD(day, 1, @dateTo)");
    }

    const result = await requestBuilder.query<{
      id: string;
      visitorId: string;
      visitorName: string;
      company: string;
      licensePlate: string | null;
      badgeNumber: string | null;
      status: string;
      gateName: string;
      hostName: string;
      hostDepartment: string;
      validFrom: string;
      validUntil: string;
      checkInAt: string | null;
      checkOutAt: string | null;
      hostSignatureStatus: string;
    }>(`
      SELECT
        vt.id,
        vis.id AS visitorId,
        CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
        vis.company,
        vt.license_plate AS licensePlate,
        vt.badge_number AS badgeNumber,
        vt.status,
        ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
        vt.host_name AS hostName,
        vt.host_department AS hostDepartment,
        CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
        CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
        CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
        CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
        ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus
      FROM dbo.visits vt
      INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
      LEFT JOIN dbo.gates g ON g.id = vt.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY vt.valid_from DESC
    `);

    return response.json({ visits: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchshistorie konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/visits/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<any>(`
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
          vis.visitor_street AS visitorStreet,
          vis.visitor_house_number AS visitorHouseNumber,
          vis.visitor_postal_code AS visitorPostalCode,
          vis.visitor_city AS visitorCity,
          vis.visitor_address AS visitorAddress,
          vis.id_document_type AS idDocumentType,
          CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
          vis.id_document_number AS idDocumentNumber,
          vis.id_document_issuing_place AS idDocumentIssuingPlace,
          vt.host_name AS hostName,
          vt.host_email AS hostEmail,
          vt.host_phone AS hostPhone,
          vt.host_department AS hostDepartment,
          vt.host_unit AS hostUnit,
          vt.host_building AS hostBuilding,
          vt.host_room AS hostRoom,
          vt.host_extension AS hostExtension,
          vt.purpose,
          vt.visit_purpose_type AS visitPurposeType,
          vt.visit_company_order AS visitCompanyOrder,
          vt.visit_end_type AS visitEndType,
          vt.forwarded_to_note AS forwardedToNote,
          vt.gate_id AS gateId,
          ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
          vt.license_plate AS licensePlate,
          vt.signed_by_host_confirmed AS signedByHostConfirmed,
          ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
          CONVERT(NVARCHAR(10), vt.host_signature_date, 23) AS hostSignatureDate,
          vt.host_signature_note AS hostSignatureNote,
          confirmer.username AS hostSignatureConfirmedBy,
          CONVERT(NVARCHAR(30), vt.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
          vt.checkout_note AS checkoutNote,
          confirmerIn.username AS checkInBy,
          confirmerOut.username AS checkOutBy,
          vt.device_photo_app AS devicePhotoApp,
          vt.device_film_app AS deviceFilmApp,
          vt.device_video_camera AS deviceVideoCamera,
          vt.device_manufacturer AS deviceManufacturer,
          vt.device_serial_number AS deviceSerialNumber,
          vt.device_accessories AS deviceAccessories,
          vt.device_deposit_note AS deviceDepositNote,
          vt.device_return_confirmed AS deviceReturnConfirmed,
          CONVERT(NVARCHAR(30), vt.device_returned_at, 127) AS deviceReturnedAt,
          returner.username AS deviceReturnedBy,
          vt.notes,
          vt.badge_number AS badgeNumber
        FROM dbo.visits vt
        INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
        LEFT JOIN dbo.gates g ON g.id = vt.gate_id
        LEFT JOIN dbo.users confirmer ON confirmer.id = vt.host_signature_confirmed_by
        LEFT JOIN dbo.users confirmerIn ON confirmerIn.id = vt.check_in_by
        LEFT JOIN dbo.users confirmerOut ON confirmerOut.id = vt.check_out_by
        LEFT JOIN dbo.users returner ON returner.id = vt.device_returned_by
        WHERE vt.id = @id
      `);

    const visit = result.recordset[0];
    if (!visit) {
      return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
    }

    return response.json({ visit });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdetails konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/users", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const username = typeof request.query.username === "string" ? request.query.username.trim() : "";
    const role = typeof request.query.role === "string" ? request.query.role.trim() : "";
    const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
    const gate = typeof request.query.gate === "string" ? request.query.gate.trim() : "";
    const active = typeof request.query.active === "string" ? request.query.active.trim() : "";
    const lastLoginFrom = typeof request.query.lastLoginFrom === "string" ? request.query.lastLoginFrom.trim() : "";
    const lastLoginTo = typeof request.query.lastLoginTo === "string" ? request.query.lastLoginTo.trim() : "";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      conditions.push("u.username LIKE @search");
    }
    if (username) {
      requestBuilder.input("username", sql.NVarChar(255), `%${username}%`);
      conditions.push("u.username LIKE @username");
    }
    if (role && role !== "all") {
      requestBuilder.input("role", sql.NVarChar(32), role);
      conditions.push("u.role = @role");
    }
    if (gateId) {
      requestBuilder.input("gateId", sql.UniqueIdentifier, gateId);
      conditions.push("u.gate_id = @gateId");
    }
    if (gate) {
      requestBuilder.input("gate", sql.NVarChar(255), `%${gate}%`);
      conditions.push("ISNULL(g.name, '') LIKE @gate");
    }
    if (active === "true") {
      conditions.push("u.is_active = 1");
    } else if (active === "false") {
      conditions.push("u.is_active = 0");
    }
    if (lastLoginFrom) {
      requestBuilder.input("lastLoginFrom", sql.DateTime2, new Date(lastLoginFrom));
      conditions.push("u.last_login_at >= @lastLoginFrom");
    }
    if (lastLoginTo) {
      requestBuilder.input("lastLoginTo", sql.DateTime2, new Date(lastLoginTo));
      conditions.push("u.last_login_at < DATEADD(day, 1, @lastLoginTo)");
    }

    const result = await requestBuilder.query<{
      id: string;
      username: string;
      role: "admin" | "guard" | "sibe";
      gateName: string | null;
      isActive: boolean;
      createdAt: string;
      lastLoginAt: string | null;
    }>(`
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

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_USER_SEARCH",
      objectType: "user",
      objectId: "search",
      ipAddress: getRequestIp(request)
    });

    return response.json({ users: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/sibe/audit-logs", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "sibe"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      user: string;
      action: string;
      objectType: string;
      objectId: string;
      ipAddress: string | null;
      timestamp: string;
    }>(`
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Auditlog konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/badge-texts", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);

  if (!user) {
    return;
  }

  const pool = await getPool();
  const result = await pool.request().query<{ id: string; name: string; textType: string; content: string; isActive: boolean }>(`
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

apiRouter.post("/api/admin/badge-texts", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  const parsed = badgeTextCreateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const pool = await getPool();
    const created = await pool.request()
      .input("name", parsed.data.name)
      .input("textType", parsed.data.textType)
      .input("content", parsed.data.content)
      .input("isActive", parsed.data.isActive ?? true)
      .input("updatedBy", sql.UniqueIdentifier, user.id)
      .query<{ id: string }>(`
        INSERT INTO dbo.badge_text_templates(name, text_type, content, is_active, updated_by)
        OUTPUT inserted.id
        VALUES(@name, @textType, @content, @isActive, @updatedBy)
      `);

    await writeAuditLog({
      user: user.username,
      action: "ADMIN_BADGE_TEXT_CREATED",
      objectType: "badge_text",
      objectId: created.recordset[0].id,
      ipAddress: getRequestIp(request)
    });

    return response.status(201).json({ id: created.recordset[0].id });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht angelegt werden.");
  }
});

apiRouter.get("/api/field-definitions", async (request, response) => {
  const parsed = fieldDefinitionsContextSchema.safeParse(request.query.context || "guard");
  if (!parsed.success) {
    return sendError(response, 400, "VALIDATION_ERROR", "Ungueltiger Feldkontext.");
  }

  try {
    const definitions = parsed.data === "admin"
      ? await listAdminFieldDefinitions()
      : await listFieldDefinitions(parsed.data);
    return response.json({ definitions });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Felddefinitionen konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/field-definitions", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) {
    return;
  }

  try {
    const definitions = await listAdminFieldDefinitions();
    return response.json({ definitions });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Felddefinitionen konnten nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/field-definitions/export", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const definitions = await listAdminFieldDefinitions();
    const parseOptions = (value: string | null): unknown => {
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    };
    const payload = {
      schema: "besucher-manager-field-config",
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "Besucher Manager",
      fields: definitions.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        section: field.section,
        isSystem: field.isSystem,
        isActive: field.isActive,
        showInPublic: field.showInPublic,
        showInGuard: field.showInGuard,
        showInSibe: field.showInSibe,
        showOnBadge: field.showOnBadge,
        requiredPublic: field.requiredPublic,
        requiredGuardCheckin: field.requiredGuardCheckin,
        requiredBeforePrint: field.requiredBeforePrint,
        sortOrder: field.sortOrder,
        helpText: field.helpText,
        options: parseOptions(field.optionsJson)
      }))
    };

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "FIELD_CONFIG_EXPORTED",
      objectType: "field_definitions",
      objectId: "all",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        total: payload.fields.length,
        version: payload.version
      }
    });

    const date = new Date().toISOString().slice(0, 10);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename=\"besucher-manager-field-config-${date}.json\"`);
    return response.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Feldkonfiguration konnte nicht exportiert werden.");
  }
});

apiRouter.post("/api/admin/field-definitions", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  const parsed = adminFieldDefinitionCreateSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.issues);
  }

  const payload = parsed.data;
  const fieldKeyBase = payload.fieldKey || buildFieldKeyFromLabel(payload.label);
  const fieldKey = fieldKeyBase.slice(0, 100);
  if (!/^[a-z][a-z0-9_]{1,99}$/.test(fieldKey)) {
    return sendValidationError(response, [{ field: "fieldKey", message: "Ungueltiger technischer Feldschluessel." }]);
  }

  try {
    const pool = await getPool();
    const exists = await pool.request()
      .input("fieldKey", sql.NVarChar(100), fieldKey)
      .query<{ count: number }>("SELECT COUNT(1) AS count FROM dbo.field_definitions WHERE field_key = @fieldKey");
    if ((exists.recordset[0]?.count || 0) > 0) {
      return sendError(response, 409, "CONFLICT", "Ein Feld mit diesem technischen Schluessel existiert bereits.");
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, crypto.randomUUID())
      .input("fieldKey", sql.NVarChar(100), fieldKey)
      .input("label", sql.NVarChar(200), payload.label)
      .input("fieldType", sql.NVarChar(50), payload.fieldType)
      .input("section", sql.NVarChar(50), payload.section)
      .input("isActive", sql.Bit, payload.isActive)
      .input("showInPublic", sql.Bit, payload.showInPublic)
      .input("showInGuard", sql.Bit, payload.showInGuard)
      .input("showInSibe", sql.Bit, payload.showInSibe)
      .input("showOnBadge", sql.Bit, payload.showOnBadge)
      .input("requiredPublic", sql.Bit, payload.showInPublic ? payload.requiredPublic : false)
      .input("requiredGuardCheckin", sql.Bit, payload.showInGuard ? payload.requiredGuardCheckin : false)
      .input("requiredBeforePrint", sql.Bit, payload.showInGuard ? payload.requiredBeforePrint : false)
      .input("sortOrder", sql.Int, payload.sortOrder)
      .input("helpText", sql.NVarChar(500), payload.helpText || null)
      .input("optionsJson", sql.NVarChar(sql.MAX), payload.optionsJson || null)
      .query(`
        INSERT INTO dbo.field_definitions (
          id, field_key, label, field_type, section, is_system, is_active,
          show_in_public, show_in_guard, show_in_sibe, show_on_badge,
          required_public, required_guard_checkin, required_before_print,
          sort_order, help_text, options_json
        )
        VALUES (
          @id, @fieldKey, @label, @fieldType, @section, 0, @isActive,
          @showInPublic, @showInGuard, @showInSibe, @showOnBadge,
          @requiredPublic, @requiredGuardCheckin, @requiredBeforePrint,
          @sortOrder, @helpText, @optionsJson
        )
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "FIELD_CONFIG_CREATED",
      objectType: "field_definition",
      objectId: fieldKey,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { fieldKey, section: payload.section }
    });
    return response.status(201).json({ created: true, fieldKey });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Feld konnte nicht angelegt werden.");
  }
});

apiRouter.post("/api/admin/field-definitions/import/preview", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  const parsed = fieldConfigImportSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.issues);
  }

  try {
    const pool = await getPool();
    const existing = await pool.request().query<{ fieldKey: string }>("SELECT field_key AS fieldKey FROM dbo.field_definitions");
    const existingKeys = new Set(existing.recordset.map((row) => row.fieldKey));
    const seen = new Set<string>();
    const changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }> = [];

    for (const field of parsed.data.fields) {
      if (seen.has(field.fieldKey)) {
        return sendValidationError(response, [{ field: "fieldKey", message: `Doppelter fieldKey im Import: ${field.fieldKey}` }]);
      }
      seen.add(field.fieldKey);
      changes.push({
        fieldKey: field.fieldKey,
        action: existingKeys.has(field.fieldKey) ? "update" : "create",
        label: field.label
      });
    }

    const willUpdate = changes.filter((item) => item.action === "update").length;
    const willCreate = changes.filter((item) => item.action === "create").length;
    return response.json({
      valid: true,
      summary: {
        total: parsed.data.fields.length,
        willUpdate,
        willCreate,
        willSkip: 0,
        warnings: [] as string[]
      },
      changes
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Import-Vorschau konnte nicht erstellt werden.");
  }
});

apiRouter.post("/api/admin/field-definitions/import", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  const parsed = fieldConfigImportSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.issues);
  }

  const payload = parsed.data;
  const seen = new Set<string>();
  for (const field of payload.fields) {
    if (seen.has(field.fieldKey)) {
      return sendValidationError(response, [{ field: "fieldKey", message: `Doppelter fieldKey im Import: ${field.fieldKey}` }]);
    }
    seen.add(field.fieldKey);
  }

  try {
    const pool = await getPool();
    const existingResult = await pool.request().query<{
      id: string;
      fieldKey: string;
      isSystem: boolean;
      fieldType: string;
    }>(`
      SELECT id, field_key AS fieldKey, is_system AS isSystem, field_type AS fieldType
      FROM dbo.field_definitions
    `);
    const existingMap = new Map(existingResult.recordset.map((entry) => [entry.fieldKey, entry]));

    let updated = 0;
    let created = 0;
    for (const field of payload.fields) {
      const existing = existingMap.get(field.fieldKey);
      const optionsJson = normalizeImportOptions(field.options);
      if (existing) {
        const fieldTypeForUpdate = existing.isSystem ? existing.fieldType : field.fieldType;
        await pool.request()
          .input("id", sql.UniqueIdentifier, existing.id)
          .input("label", sql.NVarChar(200), field.label)
          .input("section", sql.NVarChar(50), field.section)
          .input("isActive", sql.Bit, field.isActive)
          .input("showInPublic", sql.Bit, field.showInPublic)
          .input("showInGuard", sql.Bit, field.showInGuard)
          .input("showInSibe", sql.Bit, field.showInSibe)
          .input("showOnBadge", sql.Bit, field.showOnBadge)
          .input("requiredPublic", sql.Bit, field.showInPublic ? field.requiredPublic : false)
          .input("requiredGuardCheckin", sql.Bit, field.showInGuard ? field.requiredGuardCheckin : false)
          .input("requiredBeforePrint", sql.Bit, field.showInGuard ? field.requiredBeforePrint : false)
          .input("sortOrder", sql.Int, field.sortOrder)
          .input("helpText", sql.NVarChar(500), field.helpText || null)
          .input("optionsJson", sql.NVarChar(sql.MAX), optionsJson)
          .input("fieldType", sql.NVarChar(50), fieldTypeForUpdate)
          .query(`
            UPDATE dbo.field_definitions
            SET
              label = @label,
              section = @section,
              is_active = @isActive,
              show_in_public = @showInPublic,
              show_in_guard = @showInGuard,
              show_in_sibe = @showInSibe,
              show_on_badge = @showOnBadge,
              required_public = @requiredPublic,
              required_guard_checkin = @requiredGuardCheckin,
              required_before_print = @requiredBeforePrint,
              sort_order = @sortOrder,
              help_text = @helpText,
              options_json = @optionsJson,
              field_type = @fieldType,
              updated_at = SYSUTCDATETIME()
            WHERE id = @id
          `);
        updated += 1;
      } else {
        await pool.request()
          .input("id", sql.UniqueIdentifier, crypto.randomUUID())
          .input("fieldKey", sql.NVarChar(100), field.fieldKey)
          .input("label", sql.NVarChar(200), field.label)
          .input("fieldType", sql.NVarChar(50), field.fieldType)
          .input("section", sql.NVarChar(50), field.section)
          .input("isActive", sql.Bit, field.isActive)
          .input("showInPublic", sql.Bit, field.showInPublic)
          .input("showInGuard", sql.Bit, field.showInGuard)
          .input("showInSibe", sql.Bit, field.showInSibe)
          .input("showOnBadge", sql.Bit, field.showOnBadge)
          .input("requiredPublic", sql.Bit, field.showInPublic ? field.requiredPublic : false)
          .input("requiredGuardCheckin", sql.Bit, field.showInGuard ? field.requiredGuardCheckin : false)
          .input("requiredBeforePrint", sql.Bit, field.showInGuard ? field.requiredBeforePrint : false)
          .input("sortOrder", sql.Int, field.sortOrder)
          .input("helpText", sql.NVarChar(500), field.helpText || null)
          .input("optionsJson", sql.NVarChar(sql.MAX), optionsJson)
          .query(`
            INSERT INTO dbo.field_definitions (
              id, field_key, label, field_type, section, is_system, is_active,
              show_in_public, show_in_guard, show_in_sibe, show_on_badge,
              required_public, required_guard_checkin, required_before_print,
              sort_order, help_text, options_json
            )
            VALUES (
              @id, @fieldKey, @label, @fieldType, @section, 0, @isActive,
              @showInPublic, @showInGuard, @showInSibe, @showOnBadge,
              @requiredPublic, @requiredGuardCheckin, @requiredBeforePrint,
              @sortOrder, @helpText, @optionsJson
            )
          `);
        created += 1;
      }
    }

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "FIELD_CONFIG_IMPORTED",
      objectType: "field_definitions",
      objectId: "all",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        total: payload.fields.length,
        updated,
        created,
        skipped: 0,
        version: payload.version
      }
    });

    return response.json({
      imported: true,
      summary: {
        total: payload.fields.length,
        updated,
        created,
        skipped: 0
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Feldkonfiguration konnte nicht importiert werden.");
  }
});

apiRouter.put("/api/admin/field-definitions/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) {
    return;
  }

  const parsed = adminFieldDefinitionUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    await updateFieldDefinition(request.params.id, {
      ...parsed.data,
      helpText: parsed.data.helpText?.trim() ? parsed.data.helpText.trim() : null,
      optionsJson: parsed.data.optionsJson?.trim() ? parsed.data.optionsJson.trim() : null
    });

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "ADMIN_FIELD_DEFINITION_UPDATED",
      objectType: "field_definition",
      objectId: request.params.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });

    return response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Felddefinition konnte nicht gespeichert werden.");
  }
});

apiRouter.get("/api/admin/bootstrap", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);

  if (!user) {
    return;
  }

  const pool = await getPool();
  const [users, gates, templates] = await Promise.all([
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users"),
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates"),
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.badge_text_templates")
  ]);

  return response.json({
    users: users.recordset[0]?.count ?? 0,
    gates: gates.recordset[0]?.count ?? 0,
    templates: templates.recordset[0]?.count ?? 0
  });
});

apiRouter.get("/api/admin/gates", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      name: string;
      description: string | null;
      location: string | null;
      isActive: boolean;
      sortOrder: number;
    }>(`
      SELECT id, name, description, location, is_active AS isActive, sort_order AS sortOrder
      FROM dbo.gates
      ORDER BY sort_order ASC, name ASC
    `);

    response.json({ gates: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wachen konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/admin/gates", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  const parsed = gateCreateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const pool = await getPool();
    const data = parsed.data;
    const created = await pool.request()
      .input("name", data.name)
      .input("description", data.description?.trim() || null)
      .input("location", data.location?.trim() || null)
      .input("isActive", data.isActive ?? true)
      .input("sortOrder", data.sortOrder ?? 100)
      .query<{ id: string }>(`
        INSERT INTO dbo.gates(name, description, location, is_active, sort_order)
        OUTPUT inserted.id
        VALUES(@name, @description, @location, @isActive, @sortOrder)
      `);

    await writeAuditLog({ user: user.username, action: "ADMIN_GATE_CREATED", objectType: "gate", objectId: created.recordset[0].id, ipAddress: getRequestIp(request) });
    response.status(201).json({ id: created.recordset[0].id });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht gespeichert werden.");
  }
});

apiRouter.put("/api/admin/gates/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  const parsed = gateUpdateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;

  try {
    const pool = await getPool();
    if (data.isActive === false) {
      const activeGates = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1");
      if ((activeGates.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens eine aktive Wache muss erhalten bleiben.");
      }
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("updatedBy", sql.UniqueIdentifier, user.id)
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

    await writeAuditLog({ user: user.username, action: "ADMIN_GATE_UPDATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht aktualisiert werden.");
  }
});

apiRouter.post("/api/admin/gates/:id/deactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const gateCandidate = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ isActive: boolean }>("SELECT is_active AS isActive FROM dbo.gates WHERE id = @id");

    const gateToDelete = gateCandidate.recordset[0];
    if (!gateToDelete) {
      return sendError(response, 404, "NOT_FOUND", "Wache wurde nicht gefunden.");
    }

    if (gateToDelete.isActive) {
      const activeGates = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1");
      if ((activeGates.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens eine aktive Wache muss erhalten bleiben.");
      }
    }

    const linkedUsers = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE gate_id = @id AND is_active = 1");

    if ((linkedUsers.recordset[0]?.count ?? 0) > 0) {
      return sendError(response, 409, "VALIDATION_ERROR", "Wache kann nicht deaktiviert werden, solange aktive Benutzer zugeordnet sind.");
    }

    const linkedVisits = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE gate_id = @id");

    if ((linkedVisits.recordset[0]?.count ?? 0) > 0) {
      return sendError(response, 409, "VALIDATION_ERROR", "Wache kann nicht deaktiviert werden, solange Besuche zugeordnet sind.");
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deactivatedBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.gates
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({ user: user.username, userId: user.id, action: "GATE_DEACTIVATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht deaktiviert werden.");
  }
});

apiRouter.post("/api/admin/gates/:id/reactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query(`
        UPDATE dbo.gates
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({ user: user.username, userId: user.id, action: "GATE_REACTIVATED", objectType: "gate", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Wache konnte nicht reaktiviert werden.");
  }
});

apiRouter.get("/api/admin/users", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      username: string;
      role: "admin" | "guard" | "sibe";
      gateId: string | null;
      isActive: boolean;
      lastLoginAt: string | null;
    }>(`
      SELECT id, username, role, gate_id AS gateId, is_active AS isActive, CONVERT(NVARCHAR(30), last_login_at, 127) AS lastLoginAt
      FROM dbo.users
      ORDER BY username ASC
    `);
    response.json({ users: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/admin/users", async (request, response) => {
  const admin = await requireRole(request, response, ["admin"]);
  if (!admin) return;
  const parsed = userCreateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;
  try {
    const passwordHash = await hashPassword(data.password);
    const pool = await getPool();

    const created = await pool.request()
      .input("username", data.username)
      .input("passwordHash", passwordHash)
      .input("role", data.role)
      .input("gateId", data.role === "admin" ? null : data.gateId ?? null)
      .input("isActive", data.isActive ?? true)
      .query<{ id: string }>(`
        INSERT INTO dbo.users(username, password_hash, display_name, role, gate_id, is_active)
        OUTPUT inserted.id
        VALUES(@username, @passwordHash, @username, @role, @gateId, @isActive)
      `);

    await writeAuditLog({ user: admin.username, action: "ADMIN_USER_CREATED", objectType: "user", objectId: created.recordset[0].id, ipAddress: getRequestIp(request) });
    response.status(201).json({ id: created.recordset[0].id });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht angelegt werden.");
  }
});

apiRouter.put("/api/admin/users/:id", async (request, response) => {
  const admin = await requireRole(request, response, ["admin"]);
  if (!admin) return;
  const parsed = userUpdateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;
  try {
    const pool = await getPool();
    const existing = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ role: "admin" | "guard" | "sibe"; isActive: boolean; gateId: string | null }>("SELECT role, is_active AS isActive, gate_id AS gateId FROM dbo.users WHERE id = @id");

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
      const adminCount = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
      if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
    }

    let passwordHash: string | null = null;
    if (data.password) {
      passwordHash = await hashPassword(data.password);
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("username", data.username)
      .input("passwordHash", passwordHash)
      .input("role", data.role)
      .input("gateId", nextGateId)
      .input("isActive", data.isActive)
      .input("deactivatedBy", sql.UniqueIdentifier, admin.id)
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

    await writeAuditLog({ user: admin.username, action: "ADMIN_USER_UPDATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht aktualisiert werden.");
  }
});

apiRouter.post("/api/admin/users/:id/deactivate", async (request, response) => {
  const admin = await requireRole(request, response, ["admin"]);
  if (!admin) return;

  if (admin.id === request.params.id) {
    return sendError(response, 409, "VALIDATION_ERROR", "Der aktuell angemeldete Admin kann sich nicht selbst deaktivieren.");
  }

  try {
    const pool = await getPool();
    const userToDelete = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ role: "admin" | "guard" | "sibe"; isActive: boolean }>("SELECT role, is_active AS isActive FROM dbo.users WHERE id = @id");

    const candidate = userToDelete.recordset[0];
    if (!candidate) {
      return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
    }

    if (candidate.role === "admin" && candidate.isActive) {
      const adminCount = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
      if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deactivatedBy", sql.UniqueIdentifier, admin.id)
      .query(`
        UPDATE dbo.users
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({ user: admin.username, userId: admin.id, action: "USER_DEACTIVATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht deaktiviert werden.");
  }
});

apiRouter.post("/api/admin/users/:id/reactivate", async (request, response) => {
  const admin = await requireRole(request, response, ["admin"]);
  if (!admin) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query(`
        UPDATE dbo.users
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({ user: admin.username, userId: admin.id, action: "USER_REACTIVATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht reaktiviert werden.");
  }
});

apiRouter.put("/api/admin/badge-texts/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  const parsed = badgeTextUpdateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("name", data.name)
      .input("textType", data.textType)
      .input("content", data.content)
      .input("isActive", data.isActive ?? true)
      .input("updatedBy", sql.UniqueIdentifier, user.id)
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
    await writeAuditLog({ user: user.username, action: "ADMIN_BADGE_TEXT_UPDATED", objectType: "badge_text", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht aktualisiert werden.");
  }
});

apiRouter.post("/api/admin/badge-texts/:id/deactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deactivatedBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.badge_text_templates
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "BADGE_TEXT_DEACTIVATED",
      objectType: "badge_text",
      objectId: request.params.id,
      ipAddress: getRequestIp(request)
    });

    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht deaktiviert werden.");
  }
});

apiRouter.post("/api/admin/badge-texts/:id/reactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query(`
        UPDATE dbo.badge_text_templates
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "BADGE_TEXT_REACTIVATED",
      objectType: "badge_text",
      objectId: request.params.id,
      ipAddress: getRequestIp(request)
    });

    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Hinweistext konnte nicht reaktiviert werden.");
  }
});

apiRouter.post("/api/admin/site-map/upload", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  const file = await parseSingleSiteMapUpload(request, response);
  if (!file) return;

  const parsed = siteMapUploadNameSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  const extension = getNormalizedExtension(file.originalname);
  if (!extension || !isAllowedSiteMapExtension(extension) || !isAllowedSiteMapMimeType(file.mimetype)) {
    return sendValidationError(response, { fieldErrors: { file: ["Erlaubt sind nur PNG-, JPG- und WEBP-Dateien."] } });
  }

  const storedFileName = buildStoredSiteMapFileName(extension);
  const filePath = buildSiteMapPublicPath(storedFileName);
  const uploadDirectory = await ensureSiteMapUploadDirectory();
  const targetPath = path.join(uploadDirectory, storedFileName);
  const pool = await getPool();

  try {
    const activeBefore = await pool.request().query<{ id: string }>(`
      SELECT id
      FROM dbo.site_maps
      WHERE is_active = 1
    `);

    await fs.writeFile(targetPath, file.buffer);

    await pool.request()
      .input("deactivatedBy", sql.UniqueIdentifier, user.id)
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
      .input("name", sql.NVarChar(255), parsed.data.name || path.basename(file.originalname, path.extname(file.originalname)))
      .input("filePath", sql.NVarChar(500), filePath)
      .input("originalFileName", sql.NVarChar(255), file.originalname)
      .input("storedFileName", sql.NVarChar(255), storedFileName)
      .input("mimeType", sql.NVarChar(120), file.mimetype)
      .input("fileSizeBytes", sql.BigInt, file.size)
      .input("uploadedBy", sql.UniqueIdentifier, user.id)
      .query<{ id: string }>(`
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
    await writeAuditLog({
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
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => undefined);
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht hochgeladen werden.");
  }
});

apiRouter.get("/api/admin/site-map/active", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard", "sibe"]);
  if (!user) return;

  try {
    const siteMap = await getActiveSiteMap();
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Gelaendeplan konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/site-map", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const siteMap = await getActiveSiteMap();
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Gelaendeplan konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/site-maps", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const siteMaps = await listSiteMaps();
    return response.json({ siteMaps });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Gelaendeplaene konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/admin/site-maps/:id/deactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deactivatedBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.site_maps
        SET
          is_active = 0,
          deactivated_at = SYSUTCDATETIME(),
          deactivated_by = @deactivatedBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SITE_MAP_DEACTIVATED",
      objectType: "site_map",
      objectId: request.params.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht deaktiviert werden.");
  }
});

apiRouter.post("/api/admin/site-maps/:id/activate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    await activateSiteMapById(user, request, request.params.id);
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht aktiviert werden.");
  }
});

apiRouter.post("/api/admin/site-maps/:id/reactivate", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    await activateSiteMapById(user, request, request.params.id);
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Gelaendeplan konnte nicht aktiviert werden.");
  }
});

apiRouter.get("/api/admin/audit-logs", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const action = typeof request.query.action === "string" ? request.query.action.trim() : "";
    const auditUser = typeof request.query.user === "string" ? request.query.user.trim() : "";
    const ip = typeof request.query.ip === "string" ? request.query.ip.trim() : "";
    const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
    const to = typeof request.query.to === "string" ? request.query.to.trim() : "";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      conditions.push("([user] LIKE @search OR action LIKE @search OR object_type LIKE @search OR object_id LIKE @search)");
    }

    if (action) {
      requestBuilder.input("action", sql.NVarChar(120), action);
      conditions.push("action = @action");
    }

    if (auditUser) {
      requestBuilder.input("auditUser", sql.NVarChar(255), `%${auditUser}%`);
      conditions.push("[user] LIKE @auditUser");
    }

    if (ip) {
      requestBuilder.input("ip", sql.NVarChar(64), `%${ip}%`);
      conditions.push("ISNULL(ip_address, '') LIKE @ip");
    }

    if (from) {
      requestBuilder.input("from", sql.DateTime2, new Date(from));
      conditions.push("[timestamp] >= @from");
    }

    if (to) {
      requestBuilder.input("to", sql.DateTime2, new Date(to));
      conditions.push("[timestamp] <= @to");
    }

    const result = await requestBuilder.query<{
      id: string;
      user: string;
      action: string;
      objectType: string;
      objectId: string;
      ipAddress: string | null;
      userAgent: string | null;
      metadataJson: string | null;
      timestamp: string;
    }>(`
      SELECT TOP 200
        id,
        [user],
        action,
        object_type AS objectType,
        object_id AS objectId,
        ip_address AS ipAddress,
        user_agent AS userAgent,
        metadata_json AS metadataJson,
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.audit_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY [timestamp] DESC
    `);
    response.json({ logs: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Auditlog konnte nicht geladen werden.");
  }
});

apiRouter.get("/api/admin/system-status", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  try {
    const pool = await getPool();
    const retention = await getRetentionSettings();
    const [activeVisits, configuredGates, staleVisits, openPreRegistrationsToday, signaturesPending, signaturesFollowUp, signaturesExceptions] = await Promise.all([
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in'"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1"),
      pool.request()
        .input("retentionDays", sql.Int, retention.days ?? env.VISITOR_RETENTION_DAYS)
        .query<{ count: number }>(`
          SELECT COUNT(*) AS count
          FROM dbo.visits
          WHERE created_at < DATEADD(day, -@retentionDays, SYSUTCDATETIME())
        `),
      pool.request().query<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM dbo.visits
        WHERE status = '${VISIT_STATUS.PRE_REGISTERED}'
          AND CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)
      `),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE ISNULL(host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = '${HOST_SIGNATURE_STATUS.PENDING}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.SIGNED_LATER}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.MISSING_EXCEPTION}'`)
    ]);
    response.json({
      app: "ok",
      environment: env.NODE_ENV,
      activeVisits: activeVisits.recordset[0]?.count ?? 0,
      activeGates: configuredGates.recordset[0]?.count ?? 0,
      openPreRegistrationsToday: openPreRegistrationsToday.recordset[0]?.count ?? 0,
      signaturesPending: signaturesPending.recordset[0]?.count ?? 0,
      signaturesFollowUp: signaturesFollowUp.recordset[0]?.count ?? 0,
      signaturesExceptions: signaturesExceptions.recordset[0]?.count ?? 0,
      staleVisits: retention.enabled ? staleVisits.recordset[0]?.count ?? 0 : 0,
      retentionDays: retention.days,
      retentionEnabled: retention.enabled,
      dbHost: env.MSSQL_HOST,
      dbName: env.MSSQL_DATABASE
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Systemstatus konnte nicht geladen werden.");
  }
});

apiRouter.put("/api/admin/system-settings/retention", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;
  const parsed = retentionSettingsSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  const settingValue = parsed.data.enabled ? String(parsed.data.days ?? env.VISITOR_RETENTION_DAYS) : "disabled";

  try {
    const pool = await getPool();
    await pool.request()
      .input("key", sql.NVarChar(120), "visitor_retention_days")
      .input("value", sql.NVarChar(sql.MAX), settingValue)
      .query(`
        MERGE dbo.system_settings AS target
        USING (SELECT @key AS [key], @value AS [value]) AS source
        ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET [value] = source.[value], updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([key], [value], description) VALUES (source.[key], source.[value], 'Retention in days for visit cleanup');
      `);

    await writeAuditLog({
      user: user.username,
      action: "SYSTEM_SETTING_UPDATED",
      objectType: "system_setting",
      objectId: "visitor_retention_days",
      ipAddress: getRequestIp(request)
    });

    return response.json({ success: true, retentionValue: settingValue });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Aufbewahrungseinstellung konnte nicht gespeichert werden.");
  }
});

apiRouter.post("/api/admin/visitors/:id/archive", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deletedBy", sql.UniqueIdentifier, user.id)
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

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "VISITOR_ARCHIVED",
      objectType: "visitor",
      objectId: request.params.id,
      ipAddress: getRequestIp(request)
    });

    return response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besucher konnte nicht archiviert werden.");
  }
});

apiRouter.post("/api/admin/retention/cleanup", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const retention = await getRetentionSettings();
    if (!retention.enabled || !retention.days) {
      return response.json({
        success: true,
        deletedCount: 0
      });
    }
    const cancelled = await pool.request()
      .input("retentionDays", sql.Int, retention.days)
      .input("cancelledBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.visits
        SET
          status = CASE WHEN status IN ('${VISIT_STATUS.CHECKED_OUT}', '${VISIT_STATUS.CANCELLED}') THEN status ELSE '${VISIT_STATUS.CANCELLED}' END,
          cancelled_at = CASE WHEN cancelled_at IS NULL THEN SYSUTCDATETIME() ELSE cancelled_at END,
          cancelled_by = CASE WHEN cancelled_by IS NULL THEN @cancelledBy ELSE cancelled_by END,
          cancel_reason = CASE WHEN cancel_reason IS NULL AND status <> '${VISIT_STATUS.CHECKED_OUT}' THEN 'Retention cleanup' ELSE cancel_reason END,
          updated_at = SYSUTCDATETIME()
        WHERE created_at < DATEADD(day, -@retentionDays, SYSUTCDATETIME())
      `);

    await pool.request()
      .input("retentionDays", sql.Int, retention.days)
      .input("deletedBy", sql.UniqueIdentifier, user.id)
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

    await writeAuditLog({
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
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Bereinigung konnte nicht ausgefuehrt werden.");
  }
});

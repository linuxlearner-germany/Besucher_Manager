import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer, { MulterError } from "multer";
import sql from "mssql";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getPool } from "../lib/db";
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
import {
  hashPassword,
  loadUserGroupsAndMenuAccess,
  normalizeMenuAccess,
  normalizePermissions,
  replaceUserGroupsAndMenuAccess
} from "../lib/users";
import { loadWorkflowSettings, upsertSystemSettings, WORKFLOW_SETTING_KEYS } from "../lib/systemSettings";
import { writeAuditLog } from "../lib/auditLog";
import { env } from "../config/env";
import { sendMailRelayPreview, verifyMailRelayConnection, type MailRelayTestKind } from "../lib/mailRelay";
import { buildUserImportTemplateCsv, parseUserImportCsv, type UserCsvImportRawRow } from "../lib/userCsvImport";
import { adminFieldDefinitionsRouter } from "./adminFieldDefinitions";
import {
  APPROVAL_STATUS,
  APP_MENU_KEYS,
  getAllowedMenuAccessForRole,
  getDefaultMenuAccessForRole,
  HOST_SIGNATURE_STATUS,
  VISIT_STATUS,
  parsePermissionsJson,
  type AppMenuKey,
  type AppPermission,
  type AuthenticatedUser
} from "../lib/visitWorkflow";
import {
  countUserReferences,
  getRequestIp,
  getRequestUserAgent,
  handleUnexpectedError,
  isSchemaMissingError,
  requireAnyPermission,
  requirePermission,
  requireRole,
  sendError,
  sendValidationError
} from "./shared";
const gateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  location: z.string().trim().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});
const gateUpdateSchema = gateCreateSchema.partial();
const permissionFlagsSchema = z.object({
  menu: z.object({
    preRegistration: z.boolean().optional(),
    guard: z.boolean().optional(),
    import: z.boolean().optional(),
    admin: z.boolean().optional(),
    approvals: z.boolean().optional(),
    sibe: z.boolean().optional(),
    commander: z.boolean().optional(),
    texts: z.boolean().optional()
  }).optional(),
  visits: z.object({
    read: z.boolean().optional(),
    create: z.boolean().optional(),
    update: z.boolean().optional(),
    delete: z.boolean().optional(),
    checkIn: z.boolean().optional(),
    checkOut: z.boolean().optional(),
    printBadge: z.boolean().optional()
  }).optional(),
  imports: z.object({
    execute: z.boolean().optional()
  }).optional(),
  approvals: z.object({
    read: z.boolean().optional(),
    review: z.boolean().optional(),
    approve: z.boolean().optional(),
    reject: z.boolean().optional()
  }).optional(),
  dashboards: z.object({
    sibe: z.boolean().optional(),
    commander: z.boolean().optional()
  }).optional(),
  admin: z.object({
    users: z.boolean().optional(),
    guards: z.boolean().optional(),
    texts: z.boolean().optional(),
    map: z.boolean().optional(),
    fields: z.boolean().optional(),
    system: z.boolean().optional()
  }).optional(),
  logs: z.object({
    audit: z.boolean().optional(),
    errors: z.boolean().optional()
  }).optional()
}).optional();
const userCreateSchema = z.object({
  username: z.string().trim().min(1).max(120),
  displayName: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "guard", "sibe", "kaskdt", "custom"]),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  groups: z.array(z.string().trim().min(1).max(120)).optional(),
  menuAccess: z.array(z.enum(APP_MENU_KEYS)).optional(),
  permissions: permissionFlagsSchema
}).superRefine((value, context) => {
  const allowed = new Set(getAllowedMenuAccessForRole(value.role));
  const invalid = (value.menuAccess ?? []).filter((entry) => !allowed.has(entry));

  if (invalid.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["menuAccess"],
      message: `Ungueltige Menuezugriffe fuer Rolle ${value.role}: ${invalid.join(", ")}`
    });
  }

  if (value.role !== "guard" && !value.email?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Fuer diese Rolle ist eine E-Mail-Adresse erforderlich."
    });
  }

  if (value.role !== "custom" && value.permissions) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permissions"],
      message: "Zusatzrechte koennen nur fuer Benutzerdefiniert gesetzt werden."
    });
  }
});
const userUpdateSchema = z.object({
  username: z.string().trim().min(1).max(120).optional(),
  displayName: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["admin", "guard", "sibe", "kaskdt", "custom"]).optional(),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  groups: z.array(z.string().trim().min(1).max(120)).optional(),
  menuAccess: z.array(z.enum(APP_MENU_KEYS)).optional(),
  permissions: permissionFlagsSchema
});
const badgeTextUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  textType: z.string().trim().min(1).max(80),
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
const workflowSettingsUpdateSchema = z.object({
  approvalRequired: z.boolean(),
  backgroundMode: z.enum(["image", "subtle", "plain"]),
  emailRelay: z.object({
    enabled: z.boolean(),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().trim().max(255).optional().or(z.literal("")),
    password: z.string().max(500).optional().or(z.literal("")),
    fromAddress: z.string().trim().email("Ungueltige Absenderadresse.").optional().or(z.literal("")),
    approvalRecipients: z.array(z.string().trim().email("Ungueltige E-Mail-Adresse.")).max(20)
  })
});
const mailRelayTestSchema = z.object({
  recipient: z.string().trim().email("Ungueltige Testadresse.").optional().or(z.literal("")),
  kind: z.enum(["relay", "approval_request", "approval_approved", "approval_rejected"]).optional()
});

export const apiRouter = Router();

function serializePermissions(role: AuthenticatedUser["role"], permissionsJson: string | null | undefined, menuAccess: AppMenuKey[]) {
  return normalizePermissions(role, parsePermissionsJson(permissionsJson), menuAccess);
}

function normalizePermissionsPayload(
  role: AuthenticatedUser["role"],
  permissions: z.infer<typeof permissionFlagsSchema> | undefined,
  menuAccess: AppMenuKey[]
) {
  return JSON.stringify(normalizePermissions(role, permissions ?? null, menuAccess));
}

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

const userCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});

const UI_BACKGROUND_UPLOAD_SUBDIRECTORY = "ui-backgrounds";

function buildStoredUiBackgroundFileName(extension: string): string {
  return `ui-background-${Date.now()}-${crypto.randomUUID()}${extension}`;
}

function buildUiBackgroundPublicPath(storedFileName: string): string {
  return `/uploads/${UI_BACKGROUND_UPLOAD_SUBDIRECTORY}/${storedFileName}`;
}

async function ensureUiBackgroundUploadDirectory(): Promise<string> {
  const uploadDirectory = path.join(env.uploadDir, UI_BACKGROUND_UPLOAD_SUBDIRECTORY);
  await fs.mkdir(uploadDirectory, { recursive: true });
  return uploadDirectory;
}

async function parseSingleUiBackgroundUpload(request: Request, response: Response): Promise<Express.Multer.File | null> {
  return await new Promise((resolve) => {
    siteMapUpload.array("file", 1)(request, response, (error) => {
      if (!error) {
        const files = request.files;
        if (!Array.isArray(files) || files.length === 0) {
          sendValidationError(response, { fieldErrors: { file: ["Bitte wählen Sie eine Bilddatei aus."] } });
          return resolve(null);
        }

        if (files.length > 1) {
          sendValidationError(response, { fieldErrors: { file: ["Bitte nur eine Bilddatei hochladen."] } });
          return resolve(null);
        }

        return resolve(files[0]);
      }

      if (error instanceof MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          sendError(response, 400, "FILE_TOO_LARGE", "Die Bilddatei ist größer als 10 MB.");
          return resolve(null);
        }

        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          sendValidationError(response, { fieldErrors: { file: ["Bitte nur eine Bilddatei hochladen."] } });
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
      sendError(response, 500, "UPLOAD_ERROR", "Die Bilddatei konnte nicht verarbeitet werden.");
      return resolve(null);
    });
  });
}

type UserImportIssue = {
  lineNumber: number;
  username: string | null;
  message: string;
};

function parseBooleanText(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "ja", "yes", "aktiv"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "nein", "no", "inaktiv"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isRecognizedBooleanText(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return ["1", "true", "ja", "yes", "aktiv", "0", "false", "nein", "no", "inaktiv"].includes(normalized);
}

function splitMultiValueField(value: string): string[] {
  return value
    .split(/[|;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sendUserImportTemplate(response: Response) {
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="benutzer-import-vorlage.csv"');
  return response.status(200).send(buildUserImportTemplateCsv());
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

export const adminRouter = Router();
adminRouter.use(adminFieldDefinitionsRouter);

adminRouter.get("/api/admin/badge-texts", async (request, response) => {
  const user = await requirePermission(request, response, "admin.texts");

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

adminRouter.post("/api/admin/badge-texts", async (request, response) => {
  const user = await requirePermission(request, response, "admin.texts");
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


adminRouter.get("/api/admin/bootstrap", async (request, response) => {
  const user = await requireAnyPermission(request, response, ["admin.users", "admin.guards", "admin.texts", "admin.map", "admin.fields", "admin.system", "logs.audit", "logs.errors"]);

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

adminRouter.get("/api/admin/gates", async (request, response) => {
  const user = await requirePermission(request, response, "admin.guards");
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

adminRouter.post("/api/admin/gates", async (request, response) => {
  const user = await requirePermission(request, response, "admin.guards");
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

adminRouter.put("/api/admin/gates/:id", async (request, response) => {
  const user = await requirePermission(request, response, "admin.guards");
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

adminRouter.post("/api/admin/gates/:id/deactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.guards");
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

adminRouter.post("/api/admin/gates/:id/reactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.guards");
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

adminRouter.get("/api/admin/users", async (request, response) => {
  const user = await requirePermission(request, response, "admin.users");
  if (!user) return;
  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      username: string;
      displayName: string;
      email: string | null;
      role: "admin" | "guard" | "sibe" | "kaskdt" | "custom";
      gateId: string | null;
      isActive: boolean;
      lastLoginAt: string | null;
      permissionsJson: string | null;
    }>(`
      SELECT
        id,
        username,
        display_name AS displayName,
        user_email AS email,
        role,
        gate_id AS gateId,
        is_active AS isActive,
        CONVERT(NVARCHAR(30), last_login_at, 127) AS lastLoginAt,
        permissions_json AS permissionsJson
      FROM dbo.users
      ORDER BY username ASC
    `);
    const { groupsByUserId, menuAccessByUserId } = await loadUserGroupsAndMenuAccess(result.recordset.map((entry) => entry.id));
    response.json({
      users: result.recordset.map((entry) => {
        const effectiveMenuAccess = normalizeMenuAccess(
          entry.role,
          menuAccessByUserId[entry.id]?.length ? menuAccessByUserId[entry.id] : getDefaultMenuAccessForRole(entry.role)
        );

        return {
          ...entry,
          groups: groupsByUserId[entry.id] ?? [],
          menuAccess: effectiveMenuAccess,
          permissions: serializePermissions(entry.role, entry.permissionsJson, effectiveMenuAccess)
        };
      })
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/users/import-template.csv", async (request, response) => {
  const user = await requirePermission(request, response, "admin.users");
  if (!user) return;
  return sendUserImportTemplate(response);
});

adminRouter.post("/api/admin/users/import-csv", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
  if (!admin) return;

  return userCsvUpload.single("file")(request, response, async (error) => {
    if (error) {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return sendError(response, 400, "FILE_TOO_LARGE", "Die CSV-Datei ist groesser als 2 MB.");
      }
      return sendError(response, 400, "UPLOAD_ERROR", "Die CSV-Datei konnte nicht gelesen werden.");
    }

    const file = request.file;

    if (!file) {
      return sendValidationError(response, { fieldErrors: { file: ["Bitte eine CSV-Datei auswählen."] } });
    }

    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return sendValidationError(response, { fieldErrors: { file: ["Es werden nur CSV-Dateien unterstützt."] } });
    }

    let rows: UserCsvImportRawRow[];
    try {
      rows = parseUserImportCsv(file.buffer);
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message === "user_import_missing_headers") {
      return sendValidationError(response, {
          fieldErrors: {
            file: ["Pflichtspalten fehlen. Erwartet werden mindestens username und role."]
          }
        });
      }
      return handleUnexpectedError(response, parseError, "USER_IMPORT_PARSE_FAILED", "Die CSV-Datei konnte nicht verarbeitet werden.");
    }

    if (rows.length === 0) {
      return sendValidationError(response, { fieldErrors: { file: ["Keine importierbaren Benutzerzeilen gefunden."] } });
    }

    if (rows.length > 250) {
      return sendError(response, 400, "VALIDATION_ERROR", "Bitte maximal 250 Benutzer pro Import verarbeiten.");
    }

    try {
      const pool = await getPool();
      const existingUsersResult = await pool.request().query<{
        id: string;
        username: string;
        displayName: string;
        email: string | null;
        role: "admin" | "guard" | "sibe" | "kaskdt" | "custom";
        isActive: boolean;
        permissionsJson: string | null;
      }>(`
        SELECT
          id,
          username,
          display_name AS displayName,
          user_email AS email,
          role,
          is_active AS isActive,
          permissions_json AS permissionsJson
        FROM dbo.users
      `);

      const existingUsersByUsername = new Map(existingUsersResult.recordset.map((entry) => [entry.username.trim().toLowerCase(), entry]));
      const { groupsByUserId, menuAccessByUserId } = await loadUserGroupsAndMenuAccess(existingUsersResult.recordset.map((entry) => entry.id));
      const issues: UserImportIssue[] = [];
      const seenUsernames = new Set<string>();
      const resultingActiveAdminUsernames = new Set(
        existingUsersResult.recordset
          .filter((entry) => entry.role === "admin" && entry.isActive)
          .map((entry) => entry.username.toLowerCase())
      );

      for (const row of rows) {
        const username = row.username.trim();
        const role = row.role.trim().toLowerCase() as AuthenticatedUser["role"];
        const normalizedUserName = username.toLowerCase();
        const existingUser = existingUsersByUsername.get(normalizedUserName);

        if (!username) {
          issues.push({ lineNumber: row.lineNumber, username: null, message: "Benutzername fehlt." });
          continue;
        }

        if (seenUsernames.has(normalizedUserName)) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Benutzername ist in der Datei doppelt vorhanden." });
          continue;
        }
        seenUsernames.add(normalizedUserName);

        if (!["admin", "guard", "sibe", "kaskdt", "custom"].includes(role)) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Rolle ist ungültig." });
          continue;
        }

        if (!isRecognizedBooleanText(row.isActive)) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Status ist ungültig. Erlaubt sind aktiv, inaktiv, true, false, ja oder nein." });
          continue;
        }

        const nextIsActive = parseBooleanText(row.isActive, existingUser?.isActive ?? true);

        if (existingUser?.id === admin.id && (!nextIsActive || role !== "admin")) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Der aktuell angemeldete Admin darf nicht per Import seine eigene Admin-Berechtigung verlieren." });
          continue;
        }

        const nextEmail = role === "guard"
          ? null
          : (row.email.trim().toLowerCase() || existingUser?.email?.trim().toLowerCase() || null);

        if (role !== "guard" && !nextEmail) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Für diese Rolle ist eine E-Mail-Adresse erforderlich." });
          continue;
        }

        if (nextEmail && !z.string().email().safeParse(nextEmail).success) {
          issues.push({ lineNumber: row.lineNumber, username, message: "E-Mail-Adresse ist ungültig." });
          continue;
        }

        const nextPassword = row.password.trim();
        if (!existingUser && nextPassword.length < 8) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Neue Benutzer brauchen ein Passwort mit mindestens 8 Zeichen." });
          continue;
        }

        if (nextPassword && nextPassword.length < 8) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Passwort ist kürzer als 8 Zeichen." });
          continue;
        }

        const requestedMenuAccess = row.menuAccess.trim()
          ? splitMultiValueField(row.menuAccess).map((entry) => entry as AppMenuKey)
          : existingUser
            ? normalizeMenuAccess(existingUser.role, menuAccessByUserId[existingUser.id] ?? getDefaultMenuAccessForRole(existingUser.role))
            : getDefaultMenuAccessForRole(role);
        const allowedMenuAccess = new Set(getAllowedMenuAccessForRole(role));
        const invalidMenuAccess = requestedMenuAccess.filter((entry) => !allowedMenuAccess.has(entry));

        if (invalidMenuAccess.length > 0) {
          issues.push({
            lineNumber: row.lineNumber,
            username,
            message: `Ungültige Menüzugriffe für Rolle ${role}: ${invalidMenuAccess.join(", ")}`
          });
          continue;
        }

        resultingActiveAdminUsernames.delete(normalizedUserName);
        if (role === "admin" && nextIsActive) {
          resultingActiveAdminUsernames.add(normalizedUserName);
        }
      }

      if (resultingActiveAdminUsernames.size === 0) {
        issues.push({ lineNumber: 0, username: null, message: "Mindestens ein aktiver Admin muss nach dem Import erhalten bleiben." });
      }

      if (issues.length > 0) {
        return sendError(response, 400, "VALIDATION_ERROR", "Die CSV-Datei enthält fehlerhafte Benutzerzeilen.", {
          errors: issues
        });
      }

      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const username = row.username.trim();
        const normalizedUserName = username.toLowerCase();
        const role = row.role.trim().toLowerCase() as AuthenticatedUser["role"];
        const existingUser = existingUsersByUsername.get(normalizedUserName);
        const requestedMenuAccess = row.menuAccess.trim()
          ? splitMultiValueField(row.menuAccess).map((entry) => entry as AppMenuKey)
          : existingUser
            ? normalizeMenuAccess(existingUser.role, menuAccessByUserId[existingUser.id] ?? getDefaultMenuAccessForRole(existingUser.role))
            : getDefaultMenuAccessForRole(role);
        const normalizedMenuAccess = normalizeMenuAccess(role, requestedMenuAccess);
        const permissionsJson = normalizePermissionsPayload(
          role,
          existingUser ? parsePermissionsJson(existingUser.permissionsJson) ?? undefined : undefined,
          normalizedMenuAccess
        );
        const displayName = row.displayName.trim() || existingUser?.displayName || username;
        const email = role === "guard"
          ? null
          : (row.email.trim().toLowerCase() || existingUser?.email?.trim().toLowerCase() || null);
        const groups = row.groups.trim()
          ? splitMultiValueField(row.groups)
          : existingUser
            ? (groupsByUserId[existingUser.id] ?? [])
            : [];
        const isActive = parseBooleanText(row.isActive, existingUser?.isActive ?? true);
        const passwordHash = row.password.trim() ? await hashPassword(row.password.trim()) : null;

        if (existingUser) {
          await new sql.Request(transaction)
            .input("id", sql.UniqueIdentifier, existingUser.id)
            .input("displayName", sql.NVarChar(255), displayName)
            .input("email", sql.NVarChar(255), email)
            .input("role", sql.NVarChar(32), role)
            .input("isActive", sql.Bit, isActive)
            .input("passwordHash", sql.NVarChar(255), passwordHash)
            .input("deactivatedBy", sql.UniqueIdentifier, admin.id)
            .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
            .query(`
              UPDATE dbo.users
              SET
                display_name = @displayName,
                user_email = @email,
                role = @role,
                password_hash = COALESCE(@passwordHash, password_hash),
                permissions_json = @permissionsJson,
                is_active = @isActive,
                deactivated_at = CASE
                  WHEN @isActive = 0 THEN COALESCE(deactivated_at, SYSUTCDATETIME())
                  ELSE NULL
                END,
                deactivated_by = CASE
                  WHEN @isActive = 0 THEN COALESCE(deactivated_by, @deactivatedBy)
                  ELSE NULL
                END,
                updated_at = SYSUTCDATETIME()
              WHERE id = @id
            `);

          await replaceUserGroupsAndMenuAccess(existingUser.id, role, groups, normalizedMenuAccess, transaction);
          updated += 1;
          continue;
        }

        const createdResult = await new sql.Request(transaction)
          .input("username", sql.NVarChar(120), username)
          .input("displayName", sql.NVarChar(255), displayName)
          .input("email", sql.NVarChar(255), email)
          .input("passwordHash", sql.NVarChar(255), passwordHash)
          .input("role", sql.NVarChar(32), role)
          .input("isActive", sql.Bit, isActive)
          .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
          .query<{ id: string }>(`
            INSERT INTO dbo.users(username, password_hash, display_name, user_email, role, gate_id, is_active, permissions_json)
            OUTPUT inserted.id
            VALUES(@username, @passwordHash, @displayName, @email, @role, NULL, @isActive, @permissionsJson)
          `);

        await replaceUserGroupsAndMenuAccess(createdResult.recordset[0].id, role, groups, normalizedMenuAccess, transaction);
        created += 1;
      }

      await transaction.commit();

      await writeAuditLog({
        user: admin.username,
        userId: admin.id,
        action: "ADMIN_USER_IMPORT_CSV",
        objectType: "user_import",
        objectId: "bulk_csv",
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        metadata: {
          fileName: file.originalname,
          created,
          updated,
          total: rows.length
        }
      });

      return response.status(201).json({
        success: true,
        created,
        updated,
        total: rows.length,
        message: `Import abgeschlossen: ${rows.length} Benutzer verarbeitet, ${created} neu angelegt, ${updated} aktualisiert.`
      });
    } catch (importError) {
      return handleUnexpectedError(response, importError, "USER_IMPORT_FAILED", "Der Benutzerimport konnte nicht verarbeitet werden.");
    }
  });
});

adminRouter.post("/api/admin/users", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
  if (!admin) return;
  const parsed = userCreateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;
  try {
    const passwordHash = await hashPassword(data.password);
    const pool = await getPool();
    const duplicate = await pool.request()
      .input("username", sql.NVarChar(120), data.username)
      .query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE username = @username");

    if ((duplicate.recordset[0]?.count ?? 0) > 0) {
      return sendError(response, 409, "CONFLICT", "Ein Benutzer mit diesem Namen existiert bereits.");
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const normalizedMenuAccess = normalizeMenuAccess(data.role, data.menuAccess);
    const permissionsJson = normalizePermissionsPayload(data.role, data.permissions, normalizedMenuAccess);

    const created = await new sql.Request(transaction)
      .input("username", sql.NVarChar(120), data.username)
      .input("displayName", sql.NVarChar(255), data.displayName?.trim() || data.username)
      .input("email", sql.NVarChar(255), data.role === "guard" ? null : (data.email?.trim().toLowerCase() || null))
      .input("passwordHash", passwordHash)
      .input("role", data.role)
      .input("gateId", sql.UniqueIdentifier, null)
      .input("isActive", data.isActive ?? true)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .query<{ id: string }>(`
        INSERT INTO dbo.users(username, password_hash, display_name, user_email, role, gate_id, is_active, permissions_json)
        OUTPUT inserted.id
        VALUES(@username, @passwordHash, @displayName, @email, @role, @gateId, @isActive, @permissionsJson)
      `);

    await replaceUserGroupsAndMenuAccess(
      created.recordset[0].id,
      data.role,
      data.groups,
      normalizedMenuAccess,
      transaction
    );

    await transaction.commit();

    await writeAuditLog({ user: admin.username, action: "ADMIN_USER_CREATED", objectType: "user", objectId: created.recordset[0].id, ipAddress: getRequestIp(request) });
    response.status(201).json({ id: created.recordset[0].id });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht angelegt werden.");
  }
});

adminRouter.put("/api/admin/users/:id", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
  if (!admin) return;
  const parsed = userUpdateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;
  try {
    const pool = await getPool();
    const existing = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ username: string; email: string | null; role: "admin" | "guard" | "sibe" | "kaskdt" | "custom"; isActive: boolean; gateId: string | null; permissionsJson: string | null }>("SELECT username, user_email AS email, role, is_active AS isActive, gate_id AS gateId, permissions_json AS permissionsJson FROM dbo.users WHERE id = @id");

    const currentUser = existing.recordset[0];
    if (!currentUser) {
      return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
    }

    const nextRole = data.role ?? currentUser.role;
    const nextActive = data.isActive ?? currentUser.isActive;
    const nextGateId = null;
    const nextUsername = data.username ?? currentUser.username;
    const { menuAccessByUserId } = await loadUserGroupsAndMenuAccess([request.params.id]);
    const currentMenuAccess = normalizeMenuAccess(
      currentUser.role,
      menuAccessByUserId[request.params.id]?.length
        ? menuAccessByUserId[request.params.id]
        : getDefaultMenuAccessForRole(currentUser.role)
    );
    const nextDisplayName = data.displayName?.trim() || nextUsername;
    const nextEmail = nextRole === "guard" ? null : (data.email?.trim().toLowerCase() || currentUser.email?.trim().toLowerCase() || null);
    const allowedMenuAccess = new Set(getAllowedMenuAccessForRole(nextRole));
    const requestedMenuAccess = (data.menuAccess ?? []).filter((entry) => allowedMenuAccess.has(entry));
    const nextMenuAccess = data.menuAccess
      ? requestedMenuAccess
      : currentUser.role === nextRole
        ? currentMenuAccess
        : getDefaultMenuAccessForRole(nextRole);
    const permissionsJson = normalizePermissionsPayload(
      nextRole,
      data.permissions ?? parsePermissionsJson(currentUser.permissionsJson) ?? undefined,
      nextMenuAccess
    );

    if (data.menuAccess && requestedMenuAccess.length !== data.menuAccess.length) {
      return sendError(response, 400, "VALIDATION_ERROR", "Mindestens ein Menuepunkt passt nicht zur ausgewaehlten Rolle.");
    }

    if (nextRole !== "guard" && !nextEmail) {
      return sendError(response, 400, "VALIDATION_ERROR", "Fuer diese Rolle ist eine E-Mail-Adresse erforderlich.");
    }

    if (admin.id === request.params.id && (!nextActive || nextRole !== "admin")) {
      return sendError(response, 409, "VALIDATION_ERROR", "Der aktuell angemeldete Admin kann seine eigene Admin-Berechtigung nicht entfernen.");
    }

    if (currentUser.role === "admin" && (!nextActive || nextRole !== "admin")) {
      const adminCount = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
      if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
    }

    if (data.username) {
      const duplicate = await pool.request()
        .input("id", sql.UniqueIdentifier, request.params.id)
        .input("username", sql.NVarChar(120), data.username)
        .query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE username = @username AND id <> @id");

      if ((duplicate.recordset[0]?.count ?? 0) > 0) {
        return sendError(response, 409, "CONFLICT", "Ein Benutzer mit diesem Namen existiert bereits.");
      }
    }

    let passwordHash: string | null = null;
    if (data.password) {
      passwordHash = await hashPassword(data.password);
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("username", sql.NVarChar(120), nextUsername)
      .input("displayName", sql.NVarChar(255), nextDisplayName)
      .input("email", sql.NVarChar(255), nextEmail)
      .input("passwordHash", passwordHash)
      .input("role", nextRole)
      .input("gateId", sql.UniqueIdentifier, nextGateId)
      .input("isActive", nextActive)
      .input("deactivatedBy", sql.UniqueIdentifier, admin.id)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .query(`
        UPDATE dbo.users
        SET
          username = @username,
          display_name = @displayName,
          user_email = @email,
          password_hash = COALESCE(@passwordHash, password_hash),
          role = @role,
          gate_id = @gateId,
          permissions_json = @permissionsJson,
          is_active = @isActive,
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

    await replaceUserGroupsAndMenuAccess(
      request.params.id,
      nextRole,
      data.groups,
      data.menuAccess ? requestedMenuAccess : nextMenuAccess,
      transaction
    );

    await transaction.commit();

    await writeAuditLog({ user: admin.username, action: "ADMIN_USER_UPDATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht aktualisiert werden.");
  }
});

adminRouter.post("/api/admin/users/:id/deactivate", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
  if (!admin) return;

  if (admin.id === request.params.id) {
    return sendError(response, 409, "VALIDATION_ERROR", "Der aktuell angemeldete Admin kann sich nicht selbst deaktivieren.");
  }

  try {
    const pool = await getPool();
    const userToDelete = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ role: "admin" | "guard" | "sibe" | "kaskdt"; isActive: boolean }>("SELECT role, is_active AS isActive FROM dbo.users WHERE id = @id");

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

adminRouter.post("/api/admin/users/:id/reactivate", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
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

adminRouter.delete("/api/admin/users/:id", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.users");
  if (!admin) return;

  if (admin.id === request.params.id) {
    return sendError(response, 409, "VALIDATION_ERROR", "Der aktuell angemeldete Admin kann sich nicht selbst deaktivieren.");
  }

  try {
    const pool = await getPool();
    const userResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ username: string; role: "admin" | "guard" | "sibe" | "kaskdt"; isActive: boolean }>("SELECT username, role, is_active AS isActive FROM dbo.users WHERE id = @id");
    const target = userResult.recordset[0];

    if (!target) {
      return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
    }

    if (target.role === "admin" && target.isActive) {
      const adminCount = await pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE role = 'admin' AND is_active = 1");
      if ((adminCount.recordset[0]?.count ?? 0) <= 1) {
        return sendError(response, 409, "VALIDATION_ERROR", "Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
    }

    const references = await countUserReferences(pool, request.params.id);
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("deactivatedBy", sql.UniqueIdentifier, admin.id)
      .query(`
        UPDATE dbo.users
        SET
          is_active = 0,
          deactivated_at = COALESCE(deactivated_at, SYSUTCDATETIME()),
          deactivated_by = COALESCE(deactivated_by, @deactivatedBy),
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: admin.username,
      userId: admin.id,
      action: "USER_DEACTIVATED",
      objectType: "user",
      objectId: request.params.id,
      ipAddress: getRequestIp(request),
      metadata: {
        username: target.username,
        role: target.role,
        references
      }
    });

    return response.json({
      success: true,
      deleted: false,
      softDeleted: true,
      references,
      message: "Benutzer wurde deaktiviert. Daten bleiben erhalten."
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht deaktiviert werden.");
  }
});

adminRouter.put("/api/admin/badge-texts/:id", async (request, response) => {
  const user = await requirePermission(request, response, "admin.texts");
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

adminRouter.post("/api/admin/badge-texts/:id/deactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.texts");
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

adminRouter.post("/api/admin/badge-texts/:id/reactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.texts");
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

adminRouter.post("/api/admin/site-map/upload", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
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
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Geländeplan konnte nicht hochgeladen werden.");
  }
});

adminRouter.post("/api/admin/ui-background/upload", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  const file = await parseSingleUiBackgroundUpload(request, response);
  if (!file) return;

  const parsed = siteMapUploadNameSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  const extension = getNormalizedExtension(file.originalname);
  if (!extension || !isAllowedSiteMapExtension(extension) || !isAllowedSiteMapMimeType(file.mimetype)) {
    return sendValidationError(response, { fieldErrors: { file: ["Erlaubt sind nur PNG-, JPG- und WEBP-Dateien."] } });
  }

  const storedFileName = buildStoredUiBackgroundFileName(extension);
  const filePath = buildUiBackgroundPublicPath(storedFileName);
  const uploadDirectory = await ensureUiBackgroundUploadDirectory();
  const targetPath = path.join(uploadDirectory, storedFileName);

  try {
    await fs.writeFile(targetPath, file.buffer);
    await upsertSystemSettings({
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageUrl]: filePath,
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageName]: parsed.data.name || path.basename(file.originalname, path.extname(file.originalname)),
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageOriginalFileName]: file.originalname
    });

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "UI_BACKGROUND_UPDATED",
      objectType: "system_setting",
      objectId: "ui_background_image",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        file_path: filePath,
        original_file_name: file.originalname,
        stored_file_name: storedFileName,
        mime_type: file.mimetype,
        file_size_bytes: file.size
      }
    });

    return response.status(201).json({
      success: true,
      backgroundImageUrl: filePath,
      backgroundImageName: parsed.data.name || path.basename(file.originalname, path.extname(file.originalname)),
      backgroundImageOriginalFileName: file.originalname
    });
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => undefined);
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Hintergrundbild konnte nicht hochgeladen werden.");
  }
});

adminRouter.get("/api/admin/site-map/active", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard", "sibe"]);
  if (!user) return;

  try {
    const siteMap = await getActiveSiteMap();
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Geländeplan konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/site-map", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    const siteMap = await getActiveSiteMap();
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der aktive Geländeplan konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/site-maps", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    const siteMaps = await listSiteMaps();
    return response.json({ siteMaps });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Gelaendeplaene konnten nicht geladen werden.");
  }
});

adminRouter.post("/api/admin/site-maps/:id/deactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
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
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Geländeplan konnte nicht deaktiviert werden.");
  }
});

adminRouter.post("/api/admin/site-maps/:id/activate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    await activateSiteMapById(user, request, request.params.id);
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Geländeplan konnte nicht aktiviert werden.");
  }
});

adminRouter.post("/api/admin/site-maps/:id/reactivate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    await activateSiteMapById(user, request, request.params.id);
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Geländeplan konnte nicht aktiviert werden.");
  }
});

adminRouter.get("/api/admin/audit-logs", async (request, response) => {
  const user = await requirePermission(request, response, "logs.audit");
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

adminRouter.get("/api/admin/error-logs", async (request, response) => {
  const user = await requirePermission(request, response, "logs.errors");
  if (!user) return;
  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const errorCode = typeof request.query.errorCode === "string" ? request.query.errorCode.trim() : "";
    const pathFilter = typeof request.query.path === "string" ? request.query.path.trim() : "";
    const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
    const to = typeof request.query.to === "string" ? request.query.to.trim() : "";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      conditions.push("([message] LIKE @search OR ISNULL(user_name, '') LIKE @search OR ISNULL(request_path, '') LIKE @search OR error_code LIKE @search)");
    }

    if (errorCode) {
      requestBuilder.input("errorCode", sql.NVarChar(120), errorCode);
      conditions.push("error_code = @errorCode");
    }

    if (pathFilter) {
      requestBuilder.input("pathFilter", sql.NVarChar(500), `%${pathFilter}%`);
      conditions.push("ISNULL(request_path, '') LIKE @pathFilter");
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
      level: string;
      errorCode: string;
      message: string;
      requestPath: string | null;
      requestMethod: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      userName: string | null;
      stackTrace: string | null;
      metadataJson: string | null;
      timestamp: string;
    }>(`
      SELECT TOP 200
        id,
        [level],
        error_code AS errorCode,
        [message],
        request_path AS requestPath,
        request_method AS requestMethod,
        ip_address AS ipAddress,
        user_agent AS userAgent,
        user_name AS userName,
        stack_trace AS stackTrace,
        metadata_json AS metadataJson,
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.error_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY [timestamp] DESC
    `);

    response.json({ logs: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Fehlerlog konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/system-status", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  try {
    const pool = await getPool();
    const retention = await getRetentionSettings();
    const [activeVisits, configuredGates, staleVisits, openPreRegistrationsToday, signaturesPending, signaturesFollowUp, signaturesExceptions, approvalsPending] = await Promise.all([
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
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.MISSING_EXCEPTION}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE ISNULL(approval_status, '${APPROVAL_STATUS.NOT_REQUIRED}') = '${APPROVAL_STATUS.PENDING}'`)
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
      approvalsPending: approvalsPending.recordset[0]?.count ?? 0,
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

adminRouter.get("/api/admin/system-settings/workflow-email", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  try {
    const settings = await loadWorkflowSettings();
    return response.json({
      approvalRequired: settings.approvalRequired,
      backgroundMode: settings.backgroundMode,
      backgroundImageUrl: settings.backgroundImageUrl,
      backgroundImageName: settings.backgroundImageName,
      backgroundImageOriginalFileName: settings.backgroundImageOriginalFileName,
      emailRelay: {
        source: settings.emailRelay.source,
        configPath: settings.emailRelay.configPath,
        isReadOnly: settings.emailRelay.isReadOnly,
        enabled: settings.emailRelay.enabled,
        host: settings.emailRelay.host,
        port: settings.emailRelay.port,
        secure: settings.emailRelay.secure,
        username: settings.emailRelay.username,
        fromAddress: settings.emailRelay.fromAddress,
        approvalRecipients: settings.emailRelay.approvalRecipients,
        hasPassword: settings.emailRelay.hasPassword
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Workflow-Einstellungen konnten nicht geladen werden.");
  }
});

adminRouter.put("/api/admin/system-settings/workflow-email", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  const parsed = workflowSettingsUpdateSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const currentSettings = await loadWorkflowSettings({ includeSecrets: true });
    const settingsToPersist: Record<string, string> = {
      [WORKFLOW_SETTING_KEYS.approvalRequired]: String(parsed.data.approvalRequired),
      [WORKFLOW_SETTING_KEYS.uiBackgroundMode]: parsed.data.backgroundMode
    };

    if (currentSettings.emailRelay.source !== "yml") {
      const nextPassword = parsed.data.emailRelay.password?.trim()
        ? parsed.data.emailRelay.password.trim()
        : currentSettings.emailRelay.password;

      Object.assign(settingsToPersist, {
        [WORKFLOW_SETTING_KEYS.relayEnabled]: String(parsed.data.emailRelay.enabled),
        [WORKFLOW_SETTING_KEYS.relayHost]: parsed.data.emailRelay.host.trim(),
        [WORKFLOW_SETTING_KEYS.relayPort]: String(parsed.data.emailRelay.port),
        [WORKFLOW_SETTING_KEYS.relaySecure]: String(parsed.data.emailRelay.secure),
        [WORKFLOW_SETTING_KEYS.relayUsername]: parsed.data.emailRelay.username?.trim() || "",
        [WORKFLOW_SETTING_KEYS.relayPassword]: nextPassword,
        [WORKFLOW_SETTING_KEYS.relayFrom]: parsed.data.emailRelay.fromAddress?.trim() || "",
        [WORKFLOW_SETTING_KEYS.relayApprovalTo]: parsed.data.emailRelay.approvalRecipients.join(", ")
      });
    }

    await upsertSystemSettings(settingsToPersist);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SYSTEM_WORKFLOW_SETTINGS_UPDATED",
      objectType: "system_setting",
      objectId: "workflow_email",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });

    return response.json({
      success: true,
      emailRelaySource: currentSettings.emailRelay.source
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Workflow-Einstellungen konnten nicht gespeichert werden.");
  }
});

adminRouter.post("/api/admin/system-settings/workflow-email/test", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  const parsed = mailRelayTestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const selectedKind = (parsed.data.kind ?? "relay") as MailRelayTestKind;

    if (selectedKind === "relay") {
      await verifyMailRelayConnection(parsed.data.recipient?.trim() || undefined);
    } else {
      await sendMailRelayPreview(selectedKind, parsed.data.recipient?.trim() || "");
    }

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SYSTEM_MAIL_RELAY_TESTED",
      objectType: "system_setting",
      objectId: "workflow_email",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        kind: selectedKind,
        recipient: parsed.data.recipient?.trim() || null
      }
    });
    return response.json({
      success: true,
      message: selectedKind === "relay"
        ? "Testmail erfolgreich versendet."
        : "Beispielmail erfolgreich versendet."
    });
  } catch (error) {
    if (error instanceof Error && error.message === "mail_relay_incomplete") {
      return sendError(response, 400, "VALIDATION_ERROR", "Bitte Host und Absenderadresse fuer das Relay hinterlegen.");
    }
    if (error instanceof Error && error.message === "mail_relay_missing_test_recipient") {
      return sendError(response, 400, "VALIDATION_ERROR", "Bitte mindestens einen Empfaenger oder eine Testadresse hinterlegen.");
    }
    return handleUnexpectedError(response, error, "MAIL_RELAY_TEST_FAILED", "Die Testmail konnte nicht versendet werden.");
  }
});

adminRouter.put("/api/admin/system-settings/retention", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  return sendError(
    response,
    410,
    "RETENTION_DISABLED",
    "Die Aufbewahrung wird nicht über die Anwendung gesteuert. Daten bleiben erhalten und werden nur direkt in der SQL-Datenbank gelöscht."
  );
});

adminRouter.post("/api/admin/visitors/:id/archive", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
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

adminRouter.post("/api/admin/retention/cleanup", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  return sendError(
    response,
    410,
    "RETENTION_DISABLED",
    "Die Bereinigung über die Anwendung ist deaktiviert. Löschungen erfolgen ausschließlich direkt in der SQL-Datenbank."
  );
});

import multer, { MulterError } from "multer";
import sql from "mssql";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getPool } from "../lib/db";
import {
  hashPassword,
  loadUserGroupsAndMenuAccess,
  normalizeMenuAccess,
  normalizePermissions,
  replaceUserGroupsAndMenuAccess,
  loadUserRoles,
  replaceUserRoles
} from "../lib/users";
import { loadSystemSettings, loadWorkflowSettings, upsertSystemSettings, WORKFLOW_SETTING_KEYS, SITE_MAP_SETTING_KEY } from "../lib/systemSettings";
import { writeAuditLog } from "../lib/auditLog";
import { env } from "../config/env";
import { sendMailRelayPreview, verifyMailRelayConnection, type MailRelayTestKind } from "../lib/mailRelay";
import { countOldVisits, loadRetentionSettings, runRetentionCleanup } from "../lib/retentionCleanup";
import { buildUserExportCsv, buildUserImportTemplateCsv, parseUserImportCsv, type UserCsvImportRawRow } from "../lib/userCsvImport";
import { adminFieldDefinitionsRouter } from "./adminFieldDefinitions";
import {
  APP_MENU_KEYS,
  getAllowedMenuAccessForRole,
  getDefaultMenuAccessForRole,
  getDefaultMenuAccessForRoles,
  normalizeRoles,
  HOST_SIGNATURE_STATUS,
  VISIT_STATUS,
  parsePermissionsJson,
  type AppMenuKey,
  type AppPermission,
  type AuthenticatedUser
} from "../lib/visitWorkflow";
import {
  getBadgeTextHeading,
  getDefaultBadgeTextSortOrder,
  isBadgeTextSectionType,
  toBadgeTextResponseRecord
} from "../lib/badgeTexts";
import { getUiBackgroundById, listUiBackgrounds } from "../lib/uiBackgrounds";
import { listSiteMapCatalog, selectSiteMapCatalogEntry } from "../lib/siteMapCatalog";
import { APP_VERSION } from "../lib/appVersion";
import { checkNtpServer, isValidNtpServer, normalizeNtpServer } from "../lib/ntpClient";
import { loadTimeSyncSettings, saveTimeSyncSettings } from "../lib/timeSync";
import { parseRedactedLogJson, readLogMetadataString, redactSensitiveText } from "../lib/logRedaction";
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
  texts: z.object({ manage: z.boolean().optional() }).optional(),
  dashboards: z.object({
    sibe: z.boolean().optional(),
    commander: z.boolean().optional()
  }).optional(),
  admin: z.object({
    users: z.boolean().optional(),
    guards: z.boolean().optional(),
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
  roles: z.array(z.enum(["admin", "guard", "sibe", "kaskdt", "custom"])).min(1).max(2).optional(),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  groups: z.array(z.string().trim().min(1).max(120)).optional(),
  menuAccess: z.array(z.enum(APP_MENU_KEYS)).optional(),
  permissions: permissionFlagsSchema
}).superRefine((value, context) => {
  const roles = normalizeRoles(value.roles, value.role);
  if (value.roles && roles.length !== new Set(value.roles).size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["roles"], message: "Nur die Kombination SiBe + KSKdt ist zulässig." });
  }
  const allowed = new Set(roles.flatMap(getAllowedMenuAccessForRole));
  const invalid = (value.menuAccess ?? []).filter((entry) => !allowed.has(entry));

  if (invalid.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["menuAccess"],
      message: `Ungueltige Menuezugriffe fuer Rolle ${value.role}: ${invalid.join(", ")}`
    });
  }

  if (roles.includes("sibe") && !value.email?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Fuer SiBe ist eine E-Mail-Adresse erforderlich."
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
  roles: z.array(z.enum(["admin", "guard", "sibe", "kaskdt", "custom"])).min(1).max(2).optional(),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  groups: z.array(z.string().trim().min(1).max(120)).optional(),
  menuAccess: z.array(z.enum(APP_MENU_KEYS)).optional(),
  permissions: permissionFlagsSchema
});
const badgeTextUpdateSchema = z.object({
  sectionType: z.string().trim().min(1).max(80),
  customHeading: z.string().max(120).optional().nullable(),
  content: z.string().max(8000),
  isActive: z.boolean().optional()
}).superRefine((value, context) => {
  const sectionType = value.sectionType.trim();
  const content = value.content.trim();
  const customHeading = value.customHeading?.trim() ?? "";

  if (!sectionType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sectionType"],
      message: "Bitte wählen Sie einen Bereich aus."
    });
    return;
  }

  if (!isBadgeTextSectionType(sectionType)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sectionType"],
      message: "Der ausgewählte Bereich ist ungültig."
    });
  }

  if (!content) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: "Bitte geben Sie einen Inhalt ein."
    });
  }

  if (sectionType === "custom" && !customHeading) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customHeading"],
      message: "Bitte geben Sie eine eigene Überschrift ein."
    });
  }

  if (sectionType !== "custom" && customHeading) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customHeading"],
      message: "Für Standardbereiche ist keine eigene Überschrift zulässig."
    });
  }
});
const badgeTextCreateSchema = badgeTextUpdateSchema;
function isValidSmtpFromAddress(value: string): boolean {
  if (!value || /[\r\n]/.test(value)) return value === "";
  const address = value.match(/^(?:[^<>\r\n]+\s+)?<\s*([^<>\s]+)\s*>$/)?.[1] ?? value;
  return z.string().email().safeParse(address).success;
}

const workflowSettingsUpdateSchema = z.object({
  mailFormat: z.enum(["text", "html"]).optional(),
  backgroundMode: z.enum(["image", "subtle", "plain"]),
  securityNumber: z.string()
    .trim()
    .min(1, "Bitte geben Sie eine DATEV-Nummer ein.")
    .max(255, "Die DATEV-Nummer darf maximal 255 Zeichen lang sein."),
  emailRelay: z.object({
    enabled: z.boolean(),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().trim().max(255).optional().or(z.literal("")),
    password: z.string().max(500).optional().or(z.literal("")),
    fromAddress: z.string().trim().max(500).refine(isValidSmtpFromAddress, "Ungueltige Absenderadresse.").optional().or(z.literal(""))
  })
});
const securityNumberUpdateSchema = z.object({
  securityNumber: z.string()
    .trim()
    .min(1, "Bitte geben Sie eine DATEV-Nummer ein.")
    .max(255, "Die DATEV-Nummer darf maximal 255 Zeichen lang sein.")
});
const uiBackgroundSelectionSchema = z.object({
  backgroundId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "Ungültige Hintergrund-ID."),
  backgroundMode: z.enum(["image", "subtle", "plain"])
});
const mailRelayTestSchema = z.object({
  recipient: z.string().trim().email("Ungueltige Testadresse.").optional().or(z.literal("")),
  kind: z.enum(["relay", "nationality", "pre_registration", "reminder"]).optional()
});
const timeSyncSettingsSchema = z.object({
  enabled: z.boolean(),
  server: z.string().trim().max(253)
}).superRefine((value, context) => {
  if ((value.enabled || value.server) && !isValidNtpServer(value.server)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["server"],
      message: "Bitte geben Sie einen gültigen öffentlichen DNS-Hostnamen ein, z. B. pool.ntp.org."
    });
  }
});
const timeSyncTestSchema = z.object({
  server: z.string().trim().max(253).refine(isValidNtpServer, "Ungültiger Internet-Zeitserver.")
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

const userCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});

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

export const adminRouter = Router();
adminRouter.use(adminFieldDefinitionsRouter);

adminRouter.get("/api/texts", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");

  if (!user) {
    return;
  }

  const pool = await getPool();
  const result = await pool.request().query<{
    id: string;
    name: string;
    sectionType: string;
    customHeading: string | null;
    content: string;
    isActive: boolean;
    sortOrder: number;
  }>(`
    SELECT
      id,
      name,
      text_type AS sectionType,
      custom_heading AS customHeading,
      content,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM dbo.badge_text_templates
    ORDER BY sort_order ASC, updated_at ASC, name ASC
  `);

  return response.json({
    texts: result.recordset.map(toBadgeTextResponseRecord)
  });
});

adminRouter.post("/api/texts", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
  if (!user) return;

  const parsed = badgeTextCreateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const sectionType = parsed.data.sectionType.trim();
    const customHeading = sectionType === "custom" ? parsed.data.customHeading?.trim() ?? null : null;
    const heading = getBadgeTextHeading(sectionType, customHeading);
    const pool = await getPool();
    const customSortOrder = sectionType === "custom"
      ? ((await pool.request().query<{ sortOrder: number | null }>(`
          SELECT ISNULL(MAX(sort_order), 100) + 10 AS sortOrder
          FROM dbo.badge_text_templates
          WHERE text_type = 'custom'
        `)).recordset[0]?.sortOrder ?? 110)
      : getDefaultBadgeTextSortOrder(sectionType);
    const created = await pool.request()
      .input("name", heading)
      .input("textType", sectionType)
      .input("customHeading", customHeading)
      .input("content", parsed.data.content.trim())
      .input("isActive", parsed.data.isActive ?? true)
      .input("sortOrder", customSortOrder)
      .input("updatedBy", sql.UniqueIdentifier, user.id)
      .query<{ id: string }>(`
        INSERT INTO dbo.badge_text_templates(name, text_type, custom_heading, content, is_active, sort_order, updated_by)
        OUTPUT inserted.id
        VALUES(@name, @textType, @customHeading, @content, @isActive, @sortOrder, @updatedBy)
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
  const user = await requireAnyPermission(request, response, ["admin.users", "admin.guards", "texts.manage", "admin.map", "admin.fields", "admin.system", "logs.audit", "logs.errors"]);

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
      WHERE ISNULL(is_tombstoned, 0) = 0
      ORDER BY username ASC
    `);
    const [{ groupsByUserId, menuAccessByUserId }, rolesByUserId] = await Promise.all([
      loadUserGroupsAndMenuAccess(result.recordset.map((entry) => entry.id)),
      loadUserRoles(result.recordset.map((entry) => entry.id))
    ]);
    response.json({
      users: result.recordset.map((entry) => {
        const roles = normalizeRoles(rolesByUserId[entry.id], entry.role);
        const effectiveMenuAccess = Array.from(new Set([...(menuAccessByUserId[entry.id] ?? []), ...getDefaultMenuAccessForRoles(roles)]));

        return {
          ...entry,
          roles,
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

adminRouter.get("/api/admin/users/export.csv", async (request, response) => {
  const user = await requirePermission(request, response, "admin.users");
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      username: string;
      displayName: string;
      email: string | null;
      role: string;
      gate: string | null;
      isActive: boolean;
      lastLoginAt: string | null;
    }>(`
      SELECT
        u.id,
        u.username,
        u.display_name AS displayName,
        u.user_email AS email,
        u.role,
        g.name AS gate,
        u.is_active AS isActive,
        CONVERT(NVARCHAR(30), u.last_login_at, 127) AS lastLoginAt
      FROM dbo.users u
      LEFT JOIN dbo.gates g ON g.id = u.gate_id
      WHERE ISNULL(u.is_tombstoned, 0) = 0
      ORDER BY u.username ASC
    `);
    const [{ groupsByUserId, menuAccessByUserId }, rolesByUserId] = await Promise.all([
      loadUserGroupsAndMenuAccess(result.recordset.map((entry) => entry.id)),
      loadUserRoles(result.recordset.map((entry) => entry.id))
    ]);
    const csv = buildUserExportCsv(result.recordset.map((entry) => ({
      ...entry,
      roles: normalizeRoles(rolesByUserId[entry.id], entry.role as AuthenticatedUser["role"]),
      groups: groupsByUserId[entry.id] ?? [],
      menuAccess: normalizeMenuAccess(
        entry.role as AuthenticatedUser["role"],
        menuAccessByUserId[entry.id]?.length
          ? menuAccessByUserId[entry.id]
          : getDefaultMenuAccessForRole(entry.role as AuthenticatedUser["role"])
      )
    })));

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "ADMIN_USERS_EXPORTED_CSV",
      objectType: "users",
      objectId: "all",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { count: result.recordset.length }
    });

    const date = new Date().toISOString().slice(0, 10);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="benutzer-export-${date}.csv"`);
    return response.status(200).send(csv);
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzerexport konnte nicht erstellt werden.");
  }
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
        const roles = splitMultiValueField(row.role.toLowerCase()) as AuthenticatedUser["role"][];
        const role = (roles.includes("sibe") ? "sibe" : roles[0]) as AuthenticatedUser["role"];
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

        const validRoleCombination = roles.length === 1 || (roles.length === 2 && roles.includes("sibe") && roles.includes("kaskdt"));
        if (!validRoleCombination || roles.some((entry) => !["admin", "guard", "sibe", "kaskdt", "custom"].includes(entry))) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Rolle ist ungültig." });
          continue;
        }

        if (!isRecognizedBooleanText(row.isActive)) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Status ist ungültig. Erlaubt sind aktiv, inaktiv, true, false, ja oder nein." });
          continue;
        }

        const nextIsActive = parseBooleanText(row.isActive, existingUser?.isActive ?? true);

        if (existingUser?.id === admin.id && (!nextIsActive || !roles.includes("admin"))) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Der aktuell angemeldete Admin darf nicht per Import seine eigene Admin-Berechtigung verlieren." });
          continue;
        }

        const nextEmail = row.email.trim().toLowerCase() || existingUser?.email?.trim().toLowerCase() || null;

        if (roles.includes("sibe") && !nextEmail) {
          issues.push({ lineNumber: row.lineNumber, username, message: "Für SiBe ist eine E-Mail-Adresse erforderlich." });
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
        const allowedMenuAccess = new Set(roles.flatMap(getAllowedMenuAccessForRole));
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
        if (roles.includes("admin") && nextIsActive) {
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
        const roles = splitMultiValueField(row.role.toLowerCase()) as AuthenticatedUser["role"][];
        const role = (roles.includes("sibe") ? "sibe" : roles[0]) as AuthenticatedUser["role"];
        const existingUser = existingUsersByUsername.get(normalizedUserName);
        const requestedMenuAccess = row.menuAccess.trim()
          ? splitMultiValueField(row.menuAccess).map((entry) => entry as AppMenuKey)
          : existingUser
            ? normalizeMenuAccess(existingUser.role, menuAccessByUserId[existingUser.id] ?? getDefaultMenuAccessForRole(existingUser.role))
            : getDefaultMenuAccessForRoles(roles);
        const normalizedMenuAccess = requestedMenuAccess;
        const permissionsJson = normalizePermissionsPayload(
          role,
          existingUser ? parsePermissionsJson(existingUser.permissionsJson) ?? undefined : undefined,
          normalizedMenuAccess
        );
        const displayName = row.displayName.trim() || existingUser?.displayName || username;
        const email = row.email.trim().toLowerCase() || existingUser?.email?.trim().toLowerCase() || null;
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
          await replaceUserRoles(existingUser.id, roles, transaction);
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
        await replaceUserRoles(createdResult.recordset[0].id, roles, transaction);
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
    const roles = normalizeRoles(data.roles, data.role);
    const primaryRole = roles.includes("sibe") ? "sibe" : roles[0] ?? data.role;
    const passwordHash = await hashPassword(data.password);
    const pool = await getPool();
    const duplicate = await pool.request()
      .input("username", sql.NVarChar(120), data.username)
      .query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE username = @username");

    if ((duplicate.recordset[0]?.count ?? 0) > 0) {
      return sendError(response, 409, "CONFLICT", "Ein Benutzer mit diesem Namen existiert bereits.");
    }

    const gateId: string | null = null;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const normalizedMenuAccess = data.menuAccess?.length ? data.menuAccess : getDefaultMenuAccessForRoles(roles);
    const permissionsJson = normalizePermissionsPayload(primaryRole, data.permissions, normalizedMenuAccess);

    const created = await new sql.Request(transaction)
      .input("username", sql.NVarChar(120), data.username)
      .input("displayName", sql.NVarChar(255), data.displayName?.trim() || data.username)
      .input("email", sql.NVarChar(255), data.email?.trim().toLowerCase() || null)
      .input("passwordHash", passwordHash)
      .input("role", primaryRole)
      .input("gateId", sql.UniqueIdentifier, gateId)
      .input("isActive", data.isActive ?? true)
      .input("permissionsJson", sql.NVarChar(sql.MAX), permissionsJson)
      .query<{ id: string }>(`
        INSERT INTO dbo.users(username, password_hash, display_name, user_email, role, gate_id, is_active, permissions_json)
        OUTPUT inserted.id
        VALUES(@username, @passwordHash, @displayName, @email, @role, @gateId, @isActive, @permissionsJson)
      `);

    await replaceUserGroupsAndMenuAccess(
      created.recordset[0].id,
      primaryRole,
      data.groups,
      normalizedMenuAccess,
      transaction
    );
    await replaceUserRoles(created.recordset[0].id, roles, transaction);

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
      .query<{ username: string; email: string | null; role: "admin" | "guard" | "sibe" | "kaskdt" | "custom"; isActive: boolean; gateId: string | null; permissionsJson: string | null }>("SELECT username, user_email AS email, role, is_active AS isActive, gate_id AS gateId, permissions_json AS permissionsJson FROM dbo.users WHERE id = @id AND ISNULL(is_tombstoned, 0) = 0");

    const currentUser = existing.recordset[0];
    if (!currentUser) {
      return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nicht gefunden.");
    }

    const currentRolesById = await loadUserRoles([request.params.id]);
    const requestedRoles = data.roles ?? (data.role ? [data.role] : currentRolesById[request.params.id] ?? [currentUser.role]);
    const nextRoles = normalizeRoles(requestedRoles, data.role ?? currentUser.role);
    if (nextRoles.length !== new Set(requestedRoles).size) {
      return sendError(response, 400, "INVALID_ROLE_COMBINATION", "Nur die Kombination SiBe + KSKdt ist zulässig.");
    }
    const nextRole = nextRoles.includes("sibe") ? "sibe" : nextRoles[0] ?? currentUser.role;
    const nextActive = data.isActive ?? currentUser.isActive;
    const nextGateId: string | null = null;
    const nextUsername = data.username ?? currentUser.username;
    const { menuAccessByUserId } = await loadUserGroupsAndMenuAccess([request.params.id]);
    const currentMenuAccess = normalizeMenuAccess(
      currentUser.role,
      menuAccessByUserId[request.params.id]?.length
        ? menuAccessByUserId[request.params.id]
        : getDefaultMenuAccessForRole(currentUser.role)
    );
    const nextDisplayName = data.displayName?.trim() || nextUsername;
    const nextEmail = data.email?.trim().toLowerCase() || currentUser.email?.trim().toLowerCase() || null;
    const allowedMenuAccess = new Set(nextRoles.flatMap(getAllowedMenuAccessForRole));
    const requestedMenuAccess = (data.menuAccess ?? []).filter((entry) => allowedMenuAccess.has(entry));
    const nextMenuAccess = data.menuAccess
      ? requestedMenuAccess
      : currentUser.role === nextRole
        ? currentMenuAccess
        : getDefaultMenuAccessForRoles(nextRoles);
    const permissionsJson = normalizePermissionsPayload(
      nextRole,
      data.permissions ?? parsePermissionsJson(currentUser.permissionsJson) ?? undefined,
      nextMenuAccess
    );

    if (data.menuAccess && requestedMenuAccess.length !== data.menuAccess.length) {
      return sendError(response, 400, "VALIDATION_ERROR", "Mindestens ein Menuepunkt passt nicht zur ausgewaehlten Rolle.");
    }

    if (nextRoles.includes("sibe") && !nextEmail) {
      return sendError(response, 400, "VALIDATION_ERROR", "Fuer SiBe ist eine E-Mail-Adresse erforderlich.");
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
    await replaceUserRoles(request.params.id, nextRoles, transaction);

    await transaction.commit();

    await writeAuditLog({ user: admin.username, action: "ADMIN_USER_UPDATED", objectType: "user", objectId: request.params.id, ipAddress: getRequestIp(request) });
    const savedResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{
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
        WHERE id = @id
      `);
    const savedUser = savedResult.recordset[0];
    if (!savedUser) {
      return sendError(response, 404, "NOT_FOUND", "Benutzer wurde nach dem Speichern nicht gefunden.");
    }
    const {
      groupsByUserId: savedGroupsByUserId,
      menuAccessByUserId: savedMenuAccessByUserId
    } = await loadUserGroupsAndMenuAccess([savedUser.id]);
    const effectiveMenuAccess = normalizeMenuAccess(
      savedUser.role,
      savedMenuAccessByUserId[savedUser.id]?.length
        ? savedMenuAccessByUserId[savedUser.id]
        : getDefaultMenuAccessForRole(savedUser.role)
    );

    response.json({
      success: true,
      user: {
        ...savedUser,
        roles: nextRoles,
        groups: savedGroupsByUserId[savedUser.id] ?? [],
        menuAccess: effectiveMenuAccess,
        permissions: serializePermissions(savedUser.role, savedUser.permissionsJson, effectiveMenuAccess)
      }
    });
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
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query(`
        UPDATE dbo.users
        SET
          is_active = 1,
          deactivated_at = NULL,
          deactivated_by = NULL,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id AND ISNULL(is_tombstoned, 0) = 0
      `);

    if ((result.rowsAffected[0] ?? 0) === 0) {
      return sendError(response, 409, "USER_DELETED", "Ein gelöschter Benutzer kann nicht reaktiviert werden.");
    }

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
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let deletionMode: "hard_deleted" | "tombstoned";
    try {
      if (references.length === 0) {
        await new sql.Request(transaction).input("id", sql.UniqueIdentifier, request.params.id).query(`
          DELETE FROM dbo.user_groups WHERE user_id = @id;
          DELETE FROM dbo.user_menu_access WHERE user_id = @id;
          DELETE FROM dbo.user_roles WHERE user_id = @id;
          DELETE FROM dbo.users WHERE id = @id;
        `);
        deletionMode = "hard_deleted";
      } else {
        await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, request.params.id)
          .input("deletedBy", sql.UniqueIdentifier, admin.id)
          .input("username", sql.NVarChar(120), `deleted-${request.params.id}`)
          .query(`
            UPDATE dbo.users SET username = @username, display_name = N'Gelöschter Benutzer', user_email = NULL,
              gate_id = NULL, default_gate_id = NULL, permissions_json = NULL, is_active = 0, is_tombstoned = 1,
              deleted_at = SYSUTCDATETIME(), deleted_by = @deletedBy,
              deactivated_at = COALESCE(deactivated_at, SYSUTCDATETIME()), deactivated_by = COALESCE(deactivated_by, @deletedBy),
              updated_at = SYSUTCDATETIME() WHERE id = @id;
            DELETE FROM dbo.user_groups WHERE user_id = @id;
            DELETE FROM dbo.user_menu_access WHERE user_id = @id;
            DELETE FROM dbo.user_roles WHERE user_id = @id;
          `);
        deletionMode = "tombstoned";
      }
      await transaction.commit();
    } catch (deleteError) {
      await transaction.rollback();
      if (deleteError instanceof Error && /REFERENCE|FOREIGN KEY|547/i.test(deleteError.message)) {
        return sendError(response, 409, "USER_DELETE_CONFLICT", "Der Benutzer wird noch von nicht unterstützten Datensätzen referenziert.");
      }
      throw deleteError;
    }

    await writeAuditLog({
      user: admin.username,
      userId: admin.id,
      action: "USER_DELETED",
      objectType: "user",
      objectId: request.params.id,
      ipAddress: getRequestIp(request),
      metadata: {
        username: target.username,
        role: target.role,
        references,
        deletionMode
      }
    });

    return response.json({
      success: true,
      deleted: true,
      deletionMode,
      references,
      message: deletionMode === "hard_deleted" ? "Benutzer wurde gelöscht." : "Benutzer wurde pseudonymisiert gelöscht."
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Benutzer konnte nicht deaktiviert werden.");
  }
});

adminRouter.put("/api/texts/:id", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
  if (!user) return;
  const parsed = badgeTextUpdateSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  const data = parsed.data;

  try {
    const sectionType = data.sectionType.trim();
    const customHeading = sectionType === "custom" ? data.customHeading?.trim() ?? null : null;
    const heading = getBadgeTextHeading(sectionType, customHeading);
    const pool = await getPool();
    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("name", heading)
      .input("textType", sectionType)
      .input("customHeading", customHeading)
      .input("content", data.content.trim())
      .input("isActive", data.isActive ?? true)
      .input("sortOrder", getDefaultBadgeTextSortOrder(sectionType))
      .input("updatedBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.badge_text_templates
        SET
          name = @name,
          text_type = @textType,
          custom_heading = @customHeading,
          content = @content,
          is_active = @isActive,
          deactivated_at = CASE WHEN @isActive = 0 THEN COALESCE(deactivated_at, SYSUTCDATETIME()) WHEN @isActive = 1 THEN NULL ELSE deactivated_at END,
          deactivated_by = CASE WHEN @isActive = 0 THEN COALESCE(deactivated_by, @updatedBy) WHEN @isActive = 1 THEN NULL ELSE deactivated_by END,
          sort_order = CASE
            WHEN text_type = 'custom' AND @textType = 'custom' THEN sort_order
            WHEN @textType = 'custom' AND text_type <> 'custom' THEN ISNULL((SELECT MAX(sort_order) + 10 FROM dbo.badge_text_templates WHERE text_type = 'custom'), 100)
            WHEN @textType <> 'custom' THEN @sortOrder
            ELSE sort_order
          END,
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

adminRouter.post("/api/texts/:id/move-up", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
  if (!user) return;

  try {
    const pool = await getPool();
    const currentResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ id: string; sortOrder: number }>(`
        SELECT id, sort_order AS sortOrder
        FROM dbo.badge_text_templates
        WHERE id = @id
      `);

    const current = currentResult.recordset[0];
    if (!current) {
      return sendError(response, 404, "NOT_FOUND", "Hinweistext wurde nicht gefunden.");
    }

    const previousResult = await pool.request()
      .input("sortOrder", sql.Int, current.sortOrder)
      .query<{ id: string; sortOrder: number }>(`
        SELECT TOP 1 id, sort_order AS sortOrder
        FROM dbo.badge_text_templates
        WHERE sort_order < @sortOrder
        ORDER BY sort_order DESC, updated_at DESC
      `);

    const previous = previousResult.recordset[0];
    if (!previous) {
      return response.json({ success: true });
    }

    await pool.request()
      .input("currentId", sql.UniqueIdentifier, current.id)
      .input("currentSortOrder", sql.Int, current.sortOrder)
      .input("previousId", sql.UniqueIdentifier, previous.id)
      .input("previousSortOrder", sql.Int, previous.sortOrder)
      .query(`
        UPDATE dbo.badge_text_templates
        SET sort_order = CASE
          WHEN id = @currentId THEN @previousSortOrder
          WHEN id = @previousId THEN @currentSortOrder
          ELSE sort_order
        END,
        updated_at = SYSUTCDATETIME()
        WHERE id IN (@currentId, @previousId)
      `);

    await writeAuditLog({ user: user.username, action: "ADMIN_BADGE_TEXT_MOVED_UP", objectType: "badge_text", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Reihenfolge konnte nicht geändert werden.");
  }
});

adminRouter.post("/api/texts/:id/move-down", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
  if (!user) return;

  try {
    const pool = await getPool();
    const currentResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ id: string; sortOrder: number }>(`
        SELECT id, sort_order AS sortOrder
        FROM dbo.badge_text_templates
        WHERE id = @id
      `);

    const current = currentResult.recordset[0];
    if (!current) {
      return sendError(response, 404, "NOT_FOUND", "Hinweistext wurde nicht gefunden.");
    }

    const nextResult = await pool.request()
      .input("sortOrder", sql.Int, current.sortOrder)
      .query<{ id: string; sortOrder: number }>(`
        SELECT TOP 1 id, sort_order AS sortOrder
        FROM dbo.badge_text_templates
        WHERE sort_order > @sortOrder
        ORDER BY sort_order ASC, updated_at ASC
      `);

    const next = nextResult.recordset[0];
    if (!next) {
      return response.json({ success: true });
    }

    await pool.request()
      .input("currentId", sql.UniqueIdentifier, current.id)
      .input("currentSortOrder", sql.Int, current.sortOrder)
      .input("nextId", sql.UniqueIdentifier, next.id)
      .input("nextSortOrder", sql.Int, next.sortOrder)
      .query(`
        UPDATE dbo.badge_text_templates
        SET sort_order = CASE
          WHEN id = @currentId THEN @nextSortOrder
          WHEN id = @nextId THEN @currentSortOrder
          ELSE sort_order
        END,
        updated_at = SYSUTCDATETIME()
        WHERE id IN (@currentId, @nextId)
      `);

    await writeAuditLog({ user: user.username, action: "ADMIN_BADGE_TEXT_MOVED_DOWN", objectType: "badge_text", objectId: request.params.id, ipAddress: getRequestIp(request) });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Reihenfolge konnte nicht geändert werden.");
  }
});

adminRouter.post("/api/texts/:id/deactivate", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
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

adminRouter.post("/api/texts/:id/reactivate", async (request, response) => {
  const user = await requirePermission(request, response, "texts.manage");
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
  return sendError(response, 410, "SITE_MAP_UPLOAD_DISABLED", "Der Upload ist deaktiviert. Geländepläne werden über /app/uploads/site-maps bereitgestellt.");
});

adminRouter.post("/api/admin/ui-background/upload", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  return sendError(
    response,
    410,
    "BACKGROUND_UPLOAD_DISABLED",
    "Der Upload ist deaktiviert. Hintergründe werden kontrolliert über den Projektkatalog bereitgestellt."
  );
});

adminRouter.get("/api/admin/ui-backgrounds", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  try {
    const [backgrounds, settings] = await Promise.all([
      listUiBackgrounds(),
      loadWorkflowSettings()
    ]);

    return response.json({
      backgrounds: backgrounds.map((background) => ({
        ...background,
        isActive: background.id === settings.backgroundId
      })),
      activeBackgroundId: settings.backgroundId,
      backgroundMode: settings.backgroundMode
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "BACKGROUND_CATALOG_ERROR", "Der Hintergrundkatalog konnte nicht geladen werden.");
  }
});

adminRouter.put("/api/admin/ui-backgrounds/active", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  const parsed = uiBackgroundSelectionSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const background = await getUiBackgroundById(parsed.data.backgroundId);
    if (!background) {
      return sendError(response, 400, "UNKNOWN_BACKGROUND", "Der ausgewählte Hintergrund ist nicht im Katalog vorhanden.");
    }

    await upsertSystemSettings({
      [WORKFLOW_SETTING_KEYS.uiBackgroundMode]: parsed.data.backgroundMode,
      [WORKFLOW_SETTING_KEYS.uiBackgroundId]: background.id,
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageUrl]: background.imageUrl,
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageName]: background.name,
      [WORKFLOW_SETTING_KEYS.uiBackgroundImageOriginalFileName]: background.fileName
    });

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "ADMIN_UI_BACKGROUND_SELECTED",
      objectType: "ui_background",
      objectId: background.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        background_id: background.id,
        file_name: background.fileName,
        background_mode: parsed.data.backgroundMode
      }
    });

    return response.json({
      success: true,
      backgroundId: background.id,
      backgroundMode: parsed.data.backgroundMode,
      backgroundImageUrl: background.imageUrl,
      backgroundImageName: background.name,
      backgroundImageOriginalFileName: background.fileName
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "BACKGROUND_SELECTION_ERROR", "Der Hintergrund konnte nicht gespeichert werden.");
  }
});

adminRouter.get("/api/admin/site-map/active", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard", "sibe"]);
  if (!user) return;

  try {
    const settingMap = await loadSystemSettings([SITE_MAP_SETTING_KEY]);
    const siteMaps = await listSiteMapCatalog(settingMap.get(SITE_MAP_SETTING_KEY));
    const siteMap = selectSiteMapCatalogEntry(siteMaps, settingMap.get(SITE_MAP_SETTING_KEY));
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "SITE_MAP_CATALOG_ERROR", "Der aktive Geländeplan konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/site-map", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    const settingMap = await loadSystemSettings([SITE_MAP_SETTING_KEY]);
    const siteMaps = await listSiteMapCatalog(settingMap.get(SITE_MAP_SETTING_KEY));
    const siteMap = selectSiteMapCatalogEntry(siteMaps, settingMap.get(SITE_MAP_SETTING_KEY));
    return response.json({ siteMap });
  } catch (error) {
    return handleUnexpectedError(response, error, "SITE_MAP_CATALOG_ERROR", "Der aktive Geländeplan konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/site-maps", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    const settingMap = await loadSystemSettings([SITE_MAP_SETTING_KEY]);
    const siteMaps = await listSiteMapCatalog(settingMap.get(SITE_MAP_SETTING_KEY));
    return response.json({ siteMaps });
  } catch (error) {
    return handleUnexpectedError(response, error, "SITE_MAP_CATALOG_ERROR", "Die Geländeplanliste konnte nicht geladen werden.");
  }
});

adminRouter.post("/api/admin/site-maps/:id/activate", async (request, response) => {
  const user = await requirePermission(request, response, "admin.map");
  if (!user) return;

  try {
    const siteMaps = await listSiteMapCatalog();
    const selected = siteMaps.find((entry) => entry.id === request.params.id);
    if (!selected) {
      return sendError(response, 400, "UNKNOWN_SITE_MAP", "Der Geländeplan ist nicht im Uploadpfad vorhanden.");
    }

    await upsertSystemSettings({ [SITE_MAP_SETTING_KEY]: selected.fileName });

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SITE_MAP_ACTIVATED",
      objectType: "site_map",
      objectId: selected.fileName,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { file_name: selected.fileName, source: "uploads/site-maps" }
    });
    response.json({ success: true });
  } catch (error) {
    return handleUnexpectedError(response, error, "SITE_MAP_SELECTION_ERROR", "Der Geländeplan konnte nicht aktiviert werden.");
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

adminRouter.get("/api/admin/audit-logs/:id", async (request, response) => {
  const user = await requirePermission(request, response, "logs.audit");
  if (!user) return;
  if (!z.string().uuid().safeParse(request.params.id).success) {
    return sendError(response, 404, "AUDIT_LOG_NOT_FOUND", "Log-Eintrag wurde nicht gefunden.");
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{
        id: string; user: string; userId: string | null; legacyRole: AuthenticatedUser["role"] | null;
        action: string; objectType: string; objectId: string; ipAddress: string | null;
        userAgent: string | null; metadataJson: string | null; timestamp: string;
      }>(`
        SELECT a.id, a.[user], a.user_id AS userId, u.role AS legacyRole, a.action,
          a.object_type AS objectType, a.object_id AS objectId, a.ip_address AS ipAddress,
          a.user_agent AS userAgent, a.metadata_json AS metadataJson,
          CONVERT(NVARCHAR(30), a.[timestamp], 127) AS [timestamp]
        FROM dbo.audit_logs a
        LEFT JOIN dbo.users u ON u.id = a.user_id
        WHERE a.id = @id
      `);
    const entry = result.recordset[0];
    if (!entry) return sendError(response, 404, "AUDIT_LOG_NOT_FOUND", "Log-Eintrag wurde nicht gefunden.");
    const rolesByUserId = entry.userId ? await loadUserRoles([entry.userId]) : {};
    const roles = entry.userId && rolesByUserId[entry.userId]?.length
      ? rolesByUserId[entry.userId]
      : entry.legacyRole ? [entry.legacyRole] : [];
    const metadata = parseRedactedLogJson(entry.metadataJson);
    const statusValue = readLogMetadataString(metadata, "httpStatus", "statusCode", "status");
    return response.json({
      log: {
        kind: "audit", id: entry.id, timestamp: entry.timestamp, username: entry.user,
        userId: entry.userId, roles, action: entry.action, category: entry.objectType,
        result: readLogMetadataString(metadata, "result") ?? "success",
        requestId: readLogMetadataString(metadata, "requestId", "request_id"),
        httpMethod: readLogMetadataString(metadata, "httpMethod", "method"),
        endpoint: readLogMetadataString(metadata, "endpoint", "path", "requestPath"),
        httpStatus: statusValue && Number.isFinite(Number(statusValue)) ? Number(statusValue) : null,
        errorCode: readLogMetadataString(metadata, "errorCode", "error_code"),
        errorMessage: readLogMetadataString(metadata, "errorMessage", "message"),
        source: readLogMetadataString(metadata, "source"), entityType: entry.objectType,
        entityId: entry.objectId, ipAddress: entry.ipAddress, userAgent: entry.userAgent,
        metadata, technicalContext: null
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "AUDIT_LOG_DETAIL_ERROR", "Log-Details konnten nicht geladen werden.");
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
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.error_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY [timestamp] DESC
    `);

    response.json({ logs: result.recordset.map((entry) => ({ ...entry, message: redactSensitiveText(entry.message) })) });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Fehlerlog konnte nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/error-logs/:id", async (request, response) => {
  const user = await requirePermission(request, response, "logs.errors");
  if (!user) return;
  if (!z.string().uuid().safeParse(request.params.id).success) {
    return sendError(response, 404, "ERROR_LOG_NOT_FOUND", "Log-Eintrag wurde nicht gefunden.");
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{
        id: string; level: string; errorCode: string; message: string; requestPath: string | null;
        requestMethod: string | null; requestId: string | null; ipAddress: string | null;
        userAgent: string | null; userName: string | null; userId: string | null;
        legacyRole: AuthenticatedUser["role"] | null; stackTrace: string | null;
        metadataJson: string | null; timestamp: string;
      }>(`
        SELECT e.id, e.[level], e.error_code AS errorCode, e.[message],
          e.request_path AS requestPath, e.request_method AS requestMethod,
          e.request_id AS requestId, e.ip_address AS ipAddress, e.user_agent AS userAgent,
          e.user_name AS userName, u.id AS userId, u.role AS legacyRole,
          e.stack_trace AS stackTrace, e.metadata_json AS metadataJson,
          CONVERT(NVARCHAR(30), e.[timestamp], 127) AS [timestamp]
        FROM dbo.error_logs e
        LEFT JOIN dbo.users u ON u.username = e.user_name
        WHERE e.id = @id
      `);
    const entry = result.recordset[0];
    if (!entry) return sendError(response, 404, "ERROR_LOG_NOT_FOUND", "Log-Eintrag wurde nicht gefunden.");
    const rolesByUserId = entry.userId ? await loadUserRoles([entry.userId]) : {};
    const roles = entry.userId && rolesByUserId[entry.userId]?.length
      ? rolesByUserId[entry.userId]
      : entry.legacyRole ? [entry.legacyRole] : [];
    const metadata = parseRedactedLogJson(entry.metadataJson);
    const statusValue = readLogMetadataString(metadata, "httpStatus", "statusCode", "status");
    return response.json({
      log: {
        kind: "error", id: entry.id, timestamp: entry.timestamp, username: entry.userName,
        userId: entry.userId, roles, action: entry.errorCode, category: entry.level,
        result: "failure", requestId: entry.requestId, httpMethod: entry.requestMethod,
        endpoint: entry.requestPath,
        httpStatus: statusValue && Number.isFinite(Number(statusValue)) ? Number(statusValue) : null,
        errorCode: entry.errorCode,
        errorMessage: redactSensitiveText(entry.message), source: readLogMetadataString(metadata, "source"),
        entityType: readLogMetadataString(metadata, "entityType", "objectType"),
        entityId: readLogMetadataString(metadata, "entityId", "objectId"),
        ipAddress: entry.ipAddress, userAgent: entry.userAgent,
        metadata, technicalContext: entry.stackTrace ? redactSensitiveText(entry.stackTrace) : null
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "ERROR_LOG_DETAIL_ERROR", "Log-Details konnten nicht geladen werden.");
  }
});

adminRouter.get("/api/admin/system-status", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  try {
    const pool = await getPool();
    const [activeVisits, configuredGates, openPreRegistrationsToday, signaturesPending, signaturesFollowUp, signaturesExceptions, schemaVersion] = await Promise.all([
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in' AND check_out_at IS NULL"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates WHERE is_active = 1"),
      pool.request().query<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM dbo.visits
        WHERE status = '${VISIT_STATUS.PRE_REGISTERED}'
          AND CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)
      `),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE ISNULL(host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = '${HOST_SIGNATURE_STATUS.PENDING}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.SIGNED_LATER}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.MISSING_EXCEPTION}'`),
      pool.request().query<{ version: number }>("SELECT ISNULL(MAX(migration_version), 0) AS version FROM dbo.schema_migrations")
    ]);
    response.json({
      app: "ok",
      appVersion: APP_VERSION,
      schemaVersion: schemaVersion.recordset[0]?.version ?? 0,
      environment: env.NODE_ENV,
      activeVisits: activeVisits.recordset[0]?.count ?? 0,
      activeGates: configuredGates.recordset[0]?.count ?? 0,
      openPreRegistrationsToday: openPreRegistrationsToday.recordset[0]?.count ?? 0,
      signaturesPending: signaturesPending.recordset[0]?.count ?? 0,
      signaturesFollowUp: signaturesFollowUp.recordset[0]?.count ?? 0,
      signaturesExceptions: signaturesExceptions.recordset[0]?.count ?? 0,
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
      mailFormat: settings.mailFormat,
      securityNumber: settings.securityNumber,
      backgroundMode: settings.backgroundMode,
      backgroundId: settings.backgroundId,
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
      [WORKFLOW_SETTING_KEYS.mailFormat]: parsed.data.mailFormat ?? currentSettings.mailFormat,
      [WORKFLOW_SETTING_KEYS.uiBackgroundMode]: parsed.data.backgroundMode,
      [WORKFLOW_SETTING_KEYS.securityNumber]: parsed.data.securityNumber
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
        [WORKFLOW_SETTING_KEYS.relayFrom]: parsed.data.emailRelay.fromAddress?.trim() || ""
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

adminRouter.put("/api/admin/system-settings/security-number", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;

  const parsed = securityNumberUpdateSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    await upsertSystemSettings({ [WORKFLOW_SETTING_KEYS.securityNumber]: parsed.data.securityNumber });
    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SYSTEM_SECURITY_NUMBER_UPDATED",
      objectType: "system_setting",
      objectId: "security_number",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });
    return response.json({ success: true, securityNumber: parsed.data.securityNumber });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die DATEV-Nummer konnte nicht gespeichert werden.");
  }
});

adminRouter.get("/api/admin/system-settings/maintenance", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.system");
  if (!admin) return;
  const settings = await loadSystemSettings([WORKFLOW_SETTING_KEYS.maintenanceMode]);
  return response.json({ maintenanceMode: settings.get(WORKFLOW_SETTING_KEYS.maintenanceMode) === "true" });
});

adminRouter.put("/api/admin/system-settings/maintenance", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.system");
  if (!admin) return;
  const parsed = z.object({ maintenanceMode: z.boolean() }).safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  await upsertSystemSettings({ [WORKFLOW_SETTING_KEYS.maintenanceMode]: String(parsed.data.maintenanceMode) });
  await writeAuditLog({ user: admin.username, userId: admin.id, action: "MAINTENANCE_MODE_UPDATED", objectType: "system_setting", objectId: "maintenance_mode", ipAddress: getRequestIp(request), metadata: parsed.data });
  return response.json({ success: true, ...parsed.data });
});

adminRouter.get("/api/admin/system-settings/time-sync", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.system");
  if (!admin) return;
  try {
    return response.json(await loadTimeSyncSettings());
  } catch (error) {
    return handleUnexpectedError(response, error, "TIME_SYNC_SETTINGS_FAILED", "Die Zeitserver-Einstellung konnte nicht geladen werden.");
  }
});

adminRouter.put("/api/admin/system-settings/time-sync", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.system");
  if (!admin) return;
  const parsed = timeSyncSettingsSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const previous = await loadTimeSyncSettings();
    const settings = await saveTimeSyncSettings(parsed.data.enabled, parsed.data.server);
    await writeAuditLog({
      user: admin.username,
      userId: admin.id,
      action: "BACKUP_NTP_SERVER_UPDATED",
      objectType: "system_setting",
      objectId: WORKFLOW_SETTING_KEYS.backupNtpServer,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        old_enabled: previous.enabled,
        old_server: previous.server,
        new_enabled: settings.enabled,
        new_server: settings.server
      }
    });
    return response.json(settings);
  } catch (error) {
    return handleUnexpectedError(response, error, "TIME_SYNC_SETTINGS_FAILED", "Der Internet-Zeitserver konnte nicht gespeichert werden.");
  }
});

adminRouter.post("/api/admin/system-settings/time-sync/test", async (request, response) => {
  const admin = await requirePermission(request, response, "admin.system");
  if (!admin) return;
  const parsed = timeSyncTestSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  const server = normalizeNtpServer(parsed.data.server);
  try {
    const result = await checkNtpServer(server);
    await writeAuditLog({
      user: admin.username,
      userId: admin.id,
      action: "BACKUP_NTP_SERVER_TESTED",
      objectType: "system_setting",
      objectId: WORKFLOW_SETTING_KEYS.backupNtpServer,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { server, result: "success", stratum: result.stratum, offset_ms: result.offsetMs }
    });
    return response.json(result);
  } catch (error) {
    await writeAuditLog({
      user: admin.username,
      userId: admin.id,
      action: "BACKUP_NTP_SERVER_TESTED",
      objectType: "system_setting",
      objectId: WORKFLOW_SETTING_KEYS.backupNtpServer,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { server, result: "failure" }
    }).catch(() => undefined);
    return sendError(response, 400, "NTP_SERVER_UNREACHABLE", "Der Internet-Zeitserver antwortet nicht mit einer gültigen NTP-Antwort.");
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
      return sendError(response, 400, "VALIDATION_ERROR", "Bitte mindestens einen Empfänger oder eine Testadresse hinterlegen.");
    }
    return handleUnexpectedError(response, error, "MAIL_RELAY_TEST_FAILED", "Die Testmail konnte nicht versendet werden.");
  }
});

const retentionUpdateSchema = z.object({
  enabled: z.boolean(),
  years: z.number().int().min(1).max(100)
});

adminRouter.get("/api/admin/data-retention", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  try {
    const settings = await loadRetentionSettings();
    const oldVisits = await countOldVisits(settings.years);
    return response.json({ ...settings, oldVisits });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Datenlöschung konnte nicht geladen werden.");
  }
});

adminRouter.put("/api/admin/data-retention", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  const parsed = retentionUpdateSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());
  try {
    await upsertSystemSettings({ visit_retention_enabled: String(parsed.data.enabled), visit_retention_years: String(parsed.data.years) });
    await writeAuditLog({ user: user.username, userId: user.id, action: "DATA_RETENTION_SETTINGS_UPDATED", objectType: "system_settings", objectId: "visit_retention", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), metadata: parsed.data });
    return response.json({ ...(await loadRetentionSettings()), oldVisits: await countOldVisits(parsed.data.years) });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Datenlöschung konnte nicht gespeichert werden.");
  }
});

adminRouter.post("/api/admin/data-retention/run", async (request, response) => {
  const user = await requirePermission(request, response, "admin.system");
  if (!user) return;
  try {
    const result = await runRetentionCleanup(true);
    await writeAuditLog({ user: user.username, userId: user.id, action: "DATA_RETENTION_MANUAL_RUN", objectType: "visit", objectId: "old", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), metadata: result });
    return response.json({ ...result, message: `${result.visits} alte Vorgänge wurden gelöscht.` });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die alten Vorgänge konnten nicht gelöscht werden.");
  }
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

import sql from "mssql";
import { Router } from "express";
import { z } from "zod";
import { listAdminFieldDefinitions, listFieldDefinitions, updateFieldDefinition } from "../lib/fieldDefinitions";
import { getPool } from "../lib/db";
import { writeAuditLog } from "../lib/auditLog";
import {
  getRequestIp,
  getRequestUserAgent,
  handleUnexpectedError,
  normalizeImportOptions,
  requirePermission,
  sendError,
  sendValidationError
} from "./shared";

const fieldDefinitionsContextSchema = z.enum(["public", "guard", "sibe", "badge", "admin"]);
const fieldDefinitionKeySchema = z.string().trim().regex(/^[a-z][a-z0-9_]{1,99}$/, "Ungueltiger fieldKey.");
const allowedFieldTypes = ["text", "textarea", "date", "email", "phone", "select", "checkbox", "number"] as const;
const allowedSections = ["Besucher", "Adresse", "Ansprechpartner", "Besuch", "Ausweis", "Ziel/Raum", "Geraete", "Sonstiges"] as const;

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
});

const fieldConfigImportSchema = z.object({
  schema: z.literal("besucher-manager-field-config"),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  app: z.string().optional(),
  fields: z.array(fieldConfigImportFieldSchema).min(1)
});

function parseFieldOptions(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const adminFieldDefinitionsRouter = Router();

adminFieldDefinitionsRouter.get("/api/field-definitions", async (request, response) => {
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

adminFieldDefinitionsRouter.get("/api/admin/field-definitions", async (request, response) => {
  const user = await requirePermission(request, response, "admin.fields");
  if (!user) return;

  try {
    const definitions = await listAdminFieldDefinitions();
    return response.json({ definitions });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Felddefinitionen konnten nicht geladen werden.");
  }
});

adminFieldDefinitionsRouter.get("/api/admin/field-definitions/export", async (request, response) => {
  const user = await requirePermission(request, response, "admin.fields");
  if (!user) return;

  try {
    const definitions = await listAdminFieldDefinitions();
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
        options: parseFieldOptions(field.optionsJson)
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

adminFieldDefinitionsRouter.post("/api/admin/field-definitions/import/preview", async (request, response) => {
  const user = await requirePermission(request, response, "admin.fields");
  if (!user) return;

  const parsed = fieldConfigImportSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.issues);
  }

  try {
    const pool = await getPool();
    const existing = await pool.request().query<{ fieldKey: string }>(
      "SELECT field_key AS fieldKey FROM dbo.field_definitions WHERE is_system = 1"
    );
    const existingKeys = new Set(existing.recordset.map((row) => row.fieldKey));
    const seen = new Set<string>();
    const changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }> = [];

    for (const field of parsed.data.fields) {
      if (seen.has(field.fieldKey)) {
        return sendValidationError(response, [{ field: "fieldKey", message: `Doppelter fieldKey im Import: ${field.fieldKey}` }]);
      }
      seen.add(field.fieldKey);
      if (existingKeys.has(field.fieldKey)) {
        changes.push({ fieldKey: field.fieldKey, action: "update", label: field.label });
      }
    }

    const willUpdate = changes.filter((item) => item.action === "update").length;
    const willCreate = 0;
    const willSkip = parsed.data.fields.length - changes.length;
    return response.json({
      valid: true,
      summary: {
        total: parsed.data.fields.length,
        willUpdate,
        willCreate,
        willSkip,
        warnings: willSkip ? [`${willSkip} unbekannte Feldschlüssel werden ignoriert.`] : []
      },
      changes
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Import-Vorschau konnte nicht erstellt werden.");
  }
});

adminFieldDefinitionsRouter.post("/api/admin/field-definitions/import", async (request, response) => {
  const user = await requirePermission(request, response, "admin.fields");
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
    let skipped = 0;

    for (const field of payload.fields) {
      const existing = existingMap.get(field.fieldKey);
      const optionsJson = normalizeImportOptions(field.options);
      if (existing?.isSystem) {
        const fieldTypeForUpdate = existing.fieldType;
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
        skipped += 1;
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
        skipped,
        version: payload.version
      }
    });

    return response.json({
      imported: true,
      summary: {
        total: payload.fields.length,
        updated,
        created,
        skipped
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Feldkonfiguration konnte nicht importiert werden.");
  }
});

adminFieldDefinitionsRouter.put("/api/admin/field-definitions/:id", async (request, response) => {
  const user = await requirePermission(request, response, "admin.fields");
  if (!user) return;

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

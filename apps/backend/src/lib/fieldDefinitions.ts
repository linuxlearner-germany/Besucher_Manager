import sql from "mssql";
import { getPool } from "./db";

export type FieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  section: string;
  isSystem: boolean;
  isActive: boolean;
  showInPublic: boolean;
  showInGuard: boolean;
  showInSibe: boolean;
  showOnBadge: boolean;
  requiredPublic: boolean;
  requiredGuardCheckin: boolean;
  requiredBeforePrint: boolean;
  sortOrder: number;
  helpText: string | null;
  optionsJson: string | null;
};

export type FieldDefinitionContext = "public" | "guard" | "sibe" | "badge" | "admin";

export type CompletenessFieldConfig = {
  requiredGuardCheckin: FieldDefinition[];
  requiredBeforePrint: FieldDefinition[];
  optionalInfoGuard: FieldDefinition[];
};

function buildContextWhereClause(context: FieldDefinitionContext): string {
  if (context === "public") return "is_active = 1 AND show_in_public = 1";
  if (context === "guard") return "is_active = 1 AND show_in_guard = 1";
  if (context === "sibe") return "is_active = 1 AND show_in_sibe = 1";
  if (context === "badge") return "is_active = 1 AND show_on_badge = 1";
  return "1 = 1";
}

async function queryDefinitions(whereClause: string): Promise<FieldDefinition[]> {
  const pool = await getPool();
  const result = await pool.request().query<FieldDefinition>(`
    SELECT
      id,
      field_key AS fieldKey,
      label,
      field_type AS fieldType,
      section,
      is_system AS isSystem,
      is_active AS isActive,
      show_in_public AS showInPublic,
      show_in_guard AS showInGuard,
      show_in_sibe AS showInSibe,
      show_on_badge AS showOnBadge,
      required_public AS requiredPublic,
      required_guard_checkin AS requiredGuardCheckin,
      required_before_print AS requiredBeforePrint,
      sort_order AS sortOrder,
      help_text AS helpText,
      options_json AS optionsJson
    FROM dbo.field_definitions
    WHERE ${whereClause}
    ORDER BY section ASC, sort_order ASC, label ASC
  `);

  return result.recordset;
}

export async function listFieldDefinitions(context: FieldDefinitionContext): Promise<FieldDefinition[]> {
  return queryDefinitions(buildContextWhereClause(context));
}

export async function listAdminFieldDefinitions(): Promise<FieldDefinition[]> {
  return queryDefinitions("1 = 1");
}

export async function loadCompletenessFieldConfig(): Promise<CompletenessFieldConfig | null> {
  const definitions = await queryDefinitions("is_active = 1");
  if (!definitions.length) {
    return null;
  }

  const requiredGuardCheckin = definitions.filter((field) => field.requiredGuardCheckin && field.showInGuard);
  const requiredBeforePrint = definitions.filter((field) => field.requiredBeforePrint && field.showOnBadge);
  const optionalInfoGuard = definitions.filter(
    (field) =>
      field.showInGuard
      && !field.requiredGuardCheckin
      && !field.requiredBeforePrint
      && ["visitor_birth_date", "visitor_phone", "visitor_email", "visitor_license_plate"].includes(field.fieldKey)
  );

  return {
    requiredGuardCheckin,
    requiredBeforePrint,
    optionalInfoGuard
  };
}

export async function updateFieldDefinition(
  id: string,
  payload: {
    label: string;
    section: string;
    isActive: boolean;
    showInPublic: boolean;
    showInGuard: boolean;
    showInSibe: boolean;
    showOnBadge: boolean;
    requiredPublic: boolean;
    requiredGuardCheckin: boolean;
    requiredBeforePrint: boolean;
    sortOrder: number;
    helpText: string | null;
    optionsJson: string | null;
  }
): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("label", sql.NVarChar(200), payload.label)
    .input("section", sql.NVarChar(50), payload.section)
    .input("isActive", sql.Bit, payload.isActive)
    .input("showInPublic", sql.Bit, payload.showInPublic)
    .input("showInGuard", sql.Bit, payload.showInGuard)
    .input("showInSibe", sql.Bit, payload.showInSibe)
    .input("showOnBadge", sql.Bit, payload.showOnBadge)
    .input("requiredPublic", sql.Bit, payload.requiredPublic)
    .input("requiredGuardCheckin", sql.Bit, payload.requiredGuardCheckin)
    .input("requiredBeforePrint", sql.Bit, payload.requiredBeforePrint)
    .input("sortOrder", sql.Int, payload.sortOrder)
    .input("helpText", sql.NVarChar(500), payload.helpText)
    .input("optionsJson", sql.NVarChar(sql.MAX), payload.optionsJson)
    .query(`
      UPDATE dbo.field_definitions
      SET
        label = @label,
        section = @section,
        is_active = @isActive,
        show_in_public = CASE WHEN @requiredPublic = 1 THEN 1 ELSE @showInPublic END,
        show_in_guard = CASE WHEN @requiredGuardCheckin = 1 THEN 1 ELSE @showInGuard END,
        show_in_sibe = @showInSibe,
        show_on_badge = CASE WHEN @requiredBeforePrint = 1 THEN 1 ELSE @showOnBadge END,
        required_public = @requiredPublic,
        required_guard_checkin = @requiredGuardCheckin,
        required_before_print = @requiredBeforePrint,
        sort_order = @sortOrder,
        help_text = @helpText,
        options_json = @optionsJson,
        updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `);
}

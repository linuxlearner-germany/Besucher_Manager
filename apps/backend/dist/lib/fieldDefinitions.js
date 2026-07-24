"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFieldDefinitions = listFieldDefinitions;
exports.listAdminFieldDefinitions = listAdminFieldDefinitions;
exports.loadCompletenessFieldConfig = loadCompletenessFieldConfig;
exports.updateFieldDefinition = updateFieldDefinition;
const mssql_1 = __importDefault(require("mssql"));
const db_1 = require("./db");
function buildContextWhereClause(context) {
    if (context === "public")
        return "is_active = 1 AND show_in_public = 1";
    if (context === "guard")
        return "is_active = 1 AND show_in_guard = 1";
    if (context === "sibe")
        return "is_active = 1 AND show_in_sibe = 1";
    if (context === "badge")
        return "is_active = 1 AND show_on_badge = 1";
    return "1 = 1";
}
async function queryDefinitions(whereClause) {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().query(`
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
async function listFieldDefinitions(context) {
    return queryDefinitions(buildContextWhereClause(context));
}
async function listAdminFieldDefinitions() {
    return queryDefinitions("1 = 1");
}
async function loadCompletenessFieldConfig() {
    const definitions = await queryDefinitions("is_active = 1");
    if (!definitions.length) {
        return null;
    }
    const requiredGuardCheckin = definitions.filter((field) => field.requiredGuardCheckin && field.showInGuard);
    const requiredBeforePrint = definitions.filter((field) => field.requiredBeforePrint && field.showOnBadge);
    const optionalInfoGuard = definitions.filter((field) => field.showInGuard
        && !field.requiredGuardCheckin
        && !field.requiredBeforePrint
        && ["visitor_birth_date", "visitor_phone", "visitor_email", "visitor_license_plate"].includes(field.fieldKey));
    return {
        requiredGuardCheckin,
        requiredBeforePrint,
        optionalInfoGuard
    };
}
async function updateFieldDefinition(id, payload) {
    const pool = await (0, db_1.getPool)();
    await pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, id)
        .input("label", mssql_1.default.NVarChar(200), payload.label)
        .input("section", mssql_1.default.NVarChar(50), payload.section)
        .input("isActive", mssql_1.default.Bit, payload.isActive)
        .input("showInPublic", mssql_1.default.Bit, payload.showInPublic)
        .input("showInGuard", mssql_1.default.Bit, payload.showInGuard)
        .input("showInSibe", mssql_1.default.Bit, payload.showInSibe)
        .input("showOnBadge", mssql_1.default.Bit, payload.showOnBadge)
        .input("requiredPublic", mssql_1.default.Bit, payload.requiredPublic)
        .input("requiredGuardCheckin", mssql_1.default.Bit, payload.requiredGuardCheckin)
        .input("requiredBeforePrint", mssql_1.default.Bit, payload.requiredBeforePrint)
        .input("sortOrder", mssql_1.default.Int, payload.sortOrder)
        .input("helpText", mssql_1.default.NVarChar(500), payload.helpText)
        .input("optionsJson", mssql_1.default.NVarChar(mssql_1.default.MAX), payload.optionsJson)
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

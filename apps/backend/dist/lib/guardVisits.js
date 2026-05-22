"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayVisitsForUser = getTodayVisitsForUser;
exports.getVisitDetailForUser = getVisitDetailForUser;
exports.checkInVisit = checkInVisit;
exports.checkOutVisit = checkOutVisit;
exports.updateVisitForGuard = updateVisitForGuard;
const mssql_1 = __importDefault(require("mssql"));
const db_1 = require("./db");
const auditLog_1 = require("./auditLog");
const visitWorkflow_1 = require("./visitWorkflow");
const normalizedStatusSql = `
  CASE
    WHEN v.status = 'vorangemeldet' THEN '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}'
    WHEN v.status = 'eingecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}'
    WHEN v.status = 'ausgecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}'
    ELSE v.status
  END
`;
function buildTodayQuery(status, search) {
    const predicates = [
        `(
      (v.valid_from < DATEADD(day, 1, CAST(SYSUTCDATETIME() AS date)) AND v.valid_until >= CAST(SYSUTCDATETIME() AS date))
      OR CAST(v.check_in_at AS date) = CAST(SYSUTCDATETIME() AS date)
      OR CAST(v.check_out_at AS date) = CAST(SYSUTCDATETIME() AS date)
    )`
    ];
    if (status && status !== "all") {
        predicates.push(`${normalizedStatusSql} = @status`);
    }
    if (search) {
        predicates.push(`(
      vis.first_name LIKE @search
      OR vis.last_name LIKE @search
      OR vis.company LIKE @search
      OR v.host_name LIKE @search
      OR ISNULL(v.badge_number, '') LIKE @search
      OR ISNULL(v.license_plate, '') LIKE @search
    )`);
    }
    return predicates.join(" AND ");
}
function createScopeClause(user) {
    if (user.role === "admin") {
        return "1 = 1";
    }
    return "v.gate_id = @gateId";
}
async function getTodayVisitsForUser(user, options) {
    const pool = await (0, db_1.getPool)();
    const request = pool.request();
    const search = options.search?.trim();
    if (user.role !== "admin") {
        request.input("gateId", mssql_1.default.UniqueIdentifier, user.gateId);
    }
    if (options.status && options.status !== "all") {
        request.input("status", mssql_1.default.NVarChar(32), options.status);
    }
    if (search) {
        request.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
    }
    const whereClause = `${createScopeClause(user)} AND ${buildTodayQuery(options.status, search)}`;
    const result = await request.query(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
      CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
      CONVERT(NVARCHAR(30), v.check_in_at, 127) AS checkInAt,
      CONVERT(NVARCHAR(30), v.check_out_at, 127) AS checkOutAt,
      vis.first_name AS firstName,
      vis.last_name AS lastName,
      vis.company,
      CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
      vis.phone_optional AS visitorPhone,
      vis.email_optional AS visitorEmail,
      v.host_name AS hostName,
      v.host_email AS hostEmail,
      v.host_phone AS hostPhone,
      v.host_department AS hostDepartment,
      v.purpose,
      v.gate_id AS gateId,
      g.name AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      ISNULL(v.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
      CONVERT(NVARCHAR(10), v.host_signature_date, 23) AS hostSignatureDate,
      v.host_signature_note AS hostSignatureNote,
      confirmer.username AS hostSignatureConfirmedBy,
      CONVERT(NVARCHAR(30), v.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
      v.checkout_note AS checkoutNote
      ,
      v.badge_number AS badgeNumber
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    INNER JOIN dbo.gates g ON g.id = v.gate_id
    LEFT JOIN dbo.users confirmer ON confirmer.id = v.host_signature_confirmed_by
    WHERE ${whereClause}
    ORDER BY
      CASE
        WHEN ${normalizedStatusSql} = '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}' THEN 0
        WHEN ${normalizedStatusSql} = '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}' THEN 1
        ELSE 2
      END,
      v.valid_from ASC,
      vis.last_name ASC,
      vis.first_name ASC
  `);
    return result.recordset;
}
async function getVisitDetailForUser(user, visitId) {
    const pool = await (0, db_1.getPool)();
    const request = pool.request().input("visitId", mssql_1.default.UniqueIdentifier, visitId);
    if (user.role !== "admin") {
        request.input("gateId", mssql_1.default.UniqueIdentifier, user.gateId);
    }
    const scopeClause = user.role === "admin" ? "1 = 1" : "v.gate_id = @gateId";
    const visitResult = await request.query(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
      CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
      CONVERT(NVARCHAR(30), v.check_in_at, 127) AS checkInAt,
      CONVERT(NVARCHAR(30), v.check_out_at, 127) AS checkOutAt,
      vis.first_name AS firstName,
      vis.last_name AS lastName,
      vis.company,
      CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
      vis.phone_optional AS visitorPhone,
      vis.email_optional AS visitorEmail,
      v.host_name AS hostName,
      v.host_email AS hostEmail,
      v.host_phone AS hostPhone,
      v.host_department AS hostDepartment,
      v.purpose,
      v.gate_id AS gateId,
      g.name AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      ISNULL(v.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
      CONVERT(NVARCHAR(10), v.host_signature_date, 23) AS hostSignatureDate,
      v.host_signature_note AS hostSignatureNote,
      confirmer.username AS hostSignatureConfirmedBy,
      CONVERT(NVARCHAR(30), v.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
      v.checkout_note AS checkoutNote,
      v.notes,
      v.badge_number AS badgeNumber,
      CAST(NULL AS NVARCHAR(1)) AS siteMap,
      CAST(NULL AS NVARCHAR(1)) AS badgeTexts
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    INNER JOIN dbo.gates g ON g.id = v.gate_id
    LEFT JOIN dbo.users confirmer ON confirmer.id = v.host_signature_confirmed_by
    WHERE v.id = @visitId AND ${scopeClause}
  `);
    const visit = visitResult.recordset[0];
    if (!visit) {
        return null;
    }
    const siteMapResult = await pool.request().query(`
    SELECT TOP 1
      id,
      name,
      file_path AS filePath
    FROM dbo.site_maps
    WHERE is_active = 1
    ORDER BY created_at DESC
  `);
    const badgeTextsResult = await pool.request().query(`
    SELECT
      id,
      name,
      text_type AS textType,
      content
    FROM dbo.badge_text_templates
    WHERE is_active = 1
    ORDER BY text_type ASC, name ASC
  `);
    return {
        ...visit,
        siteMap: siteMapResult.recordset[0] ?? null,
        badgeTexts: badgeTextsResult.recordset
    };
}
async function loadVisitForUpdate(transaction, visitId) {
    const result = await new mssql_1.default.Request(transaction)
        .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
        .query(`
      SELECT
        id,
        gate_id AS gateId,
        visitor_id AS visitorId,
        valid_from AS validFrom,
        status
      FROM dbo.visits WITH (UPDLOCK, ROWLOCK)
      WHERE id = @visitId
    `);
    return result.recordset[0] ?? null;
}
async function checkInVisit(user, visitId, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (!(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        (0, visitWorkflow_1.assertCanCheckIn)(visit.status);
        await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .query(`
        UPDATE dbo.visits
        SET
          status = '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}',
          check_in_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISIT_CHECKED_IN",
            objectType: "visit",
            objectId: visitId,
            ipAddress,
            userAgent
        }, transaction);
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function checkOutVisit(user, visitId, signature, checkoutNote, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (!(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        (0, visitWorkflow_1.assertCanCheckOut)(visit.status, signature);
        const normalizedSignatureDate = signature.signatureDate?.trim() ? signature.signatureDate.trim() : null;
        const normalizedSignatureNote = signature.note?.trim() ? signature.note.trim() : null;
        if (signature.status === visitWorkflow_1.HOST_SIGNATURE_STATUS.SIGNED_LATER && normalizedSignatureDate) {
            const signatureDate = new Date(normalizedSignatureDate);
            const visitStart = visit.validFrom ? new Date(visit.validFrom) : null;
            if (Number.isNaN(signatureDate.getTime())) {
                throw new Error("host_signature_date_required");
            }
            if (visitStart && signatureDate < new Date(visitStart.toISOString().slice(0, 10))) {
                throw new Error("host_signature_date_before_visit");
            }
        }
        await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .input("checkoutNote", mssql_1.default.NVarChar(mssql_1.default.MAX), checkoutNote?.trim() || null)
            .input("signatureStatus", mssql_1.default.NVarChar(40), signature.status)
            .input("signatureDate", mssql_1.default.Date, normalizedSignatureDate)
            .input("signatureNote", mssql_1.default.NVarChar(500), normalizedSignatureNote)
            .input("confirmedBy", mssql_1.default.UniqueIdentifier, user.id)
            .query(`
        UPDATE dbo.visits
        SET
          status = '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}',
          check_out_at = SYSUTCDATETIME(),
          signed_by_host_confirmed = CASE WHEN @signatureStatus IN ('signed_same_day', 'signed_later') THEN 1 ELSE 0 END,
          host_signature_status = @signatureStatus,
          host_signature_date = @signatureDate,
          host_signature_note = @signatureNote,
          host_signature_confirmed_by = @confirmedBy,
          host_signature_confirmed_at = SYSUTCDATETIME(),
          checkout_note = @checkoutNote,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISIT_CHECKED_OUT",
            objectType: "visit",
            objectId: visitId,
            ipAddress,
            userAgent,
            metadata: {
                checkout_note_present: Boolean(checkoutNote?.trim()),
                signature_status: signature.status
            }
        }, transaction);
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function updateVisitForGuard(user, visitId, input, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (!(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        if (visit.status !== visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED && visit.status !== visitWorkflow_1.VISIT_STATUS.CHECKED_IN) {
            throw new Error("visit_update_status_forbidden");
        }
        if (user.role === "guard" && input.gateId !== visit.gateId) {
            throw new Error("visit_scope_forbidden");
        }
        await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .input("firstName", mssql_1.default.NVarChar(120), input.firstName.trim())
            .input("lastName", mssql_1.default.NVarChar(120), input.lastName.trim())
            .input("birthDate", mssql_1.default.Date, input.birthDate?.trim() || null)
            .input("company", mssql_1.default.NVarChar(255), input.company.trim())
            .input("phone", mssql_1.default.NVarChar(80), input.phone?.trim() || null)
            .input("email", mssql_1.default.NVarChar(255), input.email?.trim() || null)
            .input("licensePlate", mssql_1.default.NVarChar(40), input.licensePlate?.trim() || null)
            .input("hostName", mssql_1.default.NVarChar(255), input.hostName.trim())
            .input("hostEmail", mssql_1.default.NVarChar(255), input.hostEmail?.trim() || null)
            .input("hostPhone", mssql_1.default.NVarChar(80), input.hostPhone?.trim() || null)
            .input("hostDepartment", mssql_1.default.NVarChar(255), input.hostDepartment.trim())
            .input("purpose", mssql_1.default.NVarChar(500), input.purpose.trim())
            .input("gateId", mssql_1.default.UniqueIdentifier, input.gateId)
            .input("validFrom", mssql_1.default.DateTime2, new Date(input.validFrom))
            .input("validUntil", mssql_1.default.DateTime2, new Date(input.validUntil))
            .input("notes", mssql_1.default.NVarChar(mssql_1.default.MAX), input.notes?.trim() || null)
            .query(`
        UPDATE dbo.visitors
        SET
          first_name = @firstName,
          last_name = @lastName,
          birth_date = @birthDate,
          company = @company,
          phone_optional = @phone,
          email_optional = @email,
          updated_at = SYSUTCDATETIME()
        WHERE id = (SELECT visitor_id FROM dbo.visits WHERE id = @visitId);

        UPDATE dbo.visits
        SET
          host_name = @hostName,
          host_email = @hostEmail,
          host_phone = @hostPhone,
          host_department = @hostDepartment,
          purpose = @purpose,
          gate_id = @gateId,
          valid_from = @validFrom,
          valid_until = @validUntil,
          license_plate = @licensePlate,
          notes = @notes,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId;
      `);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISIT_UPDATED_BY_GUARD",
            objectType: "visit",
            objectId: visitId,
            ipAddress,
            userAgent,
            metadata: {
                changed_fields: [
                    "first_name",
                    "last_name",
                    "birth_date",
                    "company",
                    "phone_optional",
                    "email_optional",
                    "license_plate",
                    "host_name",
                    "host_email",
                    "host_phone",
                    "host_department",
                    "purpose",
                    "gate_id",
                    "valid_from",
                    "valid_until",
                    "notes"
                ]
            }
        }, transaction);
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "VISITOR_UPDATED_BY_GUARD",
            objectType: "visitor",
            objectId: visit.visitorId ?? "unknown",
            ipAddress,
            userAgent,
            metadata: {
                changed_fields: ["first_name", "last_name", "birth_date", "company", "phone_optional", "email_optional"]
            }
        }, transaction);
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}

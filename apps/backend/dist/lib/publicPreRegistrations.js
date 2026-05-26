"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listActiveGates = listActiveGates;
exports.createPreRegistration = createPreRegistration;
const mssql_1 = __importDefault(require("mssql"));
const auditLog_1 = require("./auditLog");
const db_1 = require("./db");
const badgeNumber_1 = require("./badgeNumber");
const visitWorkflow_1 = require("./visitWorkflow");
async function generateUniqueBadgeNumber(transaction) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = (0, badgeNumber_1.generateBadgeNumberCandidate)();
        const existing = await new mssql_1.default.Request(transaction)
            .input("badgeNumber", mssql_1.default.NVarChar(64), candidate)
            .query(`
        SELECT TOP 1 v.id
        FROM dbo.visits v
        INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
        WHERE v.badge_number = @badgeNumber
          AND vis.is_deleted = 0
          AND v.status <> '${visitWorkflow_1.VISIT_STATUS.CANCELLED}'
      `);
        if (existing.recordset.length === 0) {
            return candidate;
        }
    }
    throw new Error("badge_number_generation_failed");
}
function cleanOptional(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}
function normalizeDateOnlyStart(value) {
    const parsed = new Date(value);
    const utcYear = parsed.getUTCFullYear();
    const utcMonth = parsed.getUTCMonth();
    const utcDay = parsed.getUTCDate();
    return new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
}
function normalizeDateOnlyEnd(value) {
    const parsed = new Date(value);
    const utcYear = parsed.getUTCFullYear();
    const utcMonth = parsed.getUTCMonth();
    const utcDay = parsed.getUTCDate();
    return new Date(Date.UTC(utcYear, utcMonth, utcDay, 23, 59, 59, 999));
}
async function listActiveGates() {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().query(`
    SELECT
      id,
      name,
      description,
      location
    FROM dbo.gates
    WHERE is_active = 1
    ORDER BY sort_order ASC, name ASC
  `);
    return result.recordset;
}
async function createPreRegistration(input) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const badgeNumber = await generateUniqueBadgeNumber(transaction);
        const visitorInsert = await new mssql_1.default.Request(transaction)
            .input("firstName", mssql_1.default.NVarChar(120), input.firstName.trim())
            .input("lastName", mssql_1.default.NVarChar(120), input.lastName.trim())
            .input("company", mssql_1.default.NVarChar(255), input.company.trim())
            .input("birthDate", mssql_1.default.Date, cleanOptional(input.birthDate))
            .input("phone", mssql_1.default.NVarChar(80), cleanOptional(input.phone))
            .input("email", mssql_1.default.NVarChar(255), cleanOptional(input.email))
            .query(`
        INSERT INTO dbo.visitors (
          first_name,
          last_name,
          company,
          birth_date,
          phone_optional,
          email_optional
        )
        OUTPUT inserted.id
        VALUES (
          @firstName,
          @lastName,
          @company,
          @birthDate,
          @phone,
          @email
        )
      `);
        const visitorId = visitorInsert.recordset[0]?.id;
        if (!visitorId) {
            throw new Error("visitor_insert_failed");
        }
        const visitInsert = await new mssql_1.default.Request(transaction)
            .input("visitorId", mssql_1.default.UniqueIdentifier, visitorId)
            .input("hostName", mssql_1.default.NVarChar(255), input.hostName.trim())
            .input("hostEmail", mssql_1.default.NVarChar(255), cleanOptional(input.hostEmail))
            .input("hostPhone", mssql_1.default.NVarChar(80), cleanOptional(input.hostPhone))
            .input("hostDepartment", mssql_1.default.NVarChar(255), cleanOptional(input.hostDepartment))
            .input("purpose", mssql_1.default.NVarChar(500), input.purpose.trim())
            .input("validFrom", mssql_1.default.DateTime2, normalizeDateOnlyStart(input.validFrom))
            .input("validUntil", mssql_1.default.DateTime2, normalizeDateOnlyEnd(input.validUntil))
            .input("licensePlate", mssql_1.default.NVarChar(40), cleanOptional(input.licensePlate))
            .input("badgeNumber", mssql_1.default.NVarChar(64), badgeNumber)
            .input("notes", mssql_1.default.NVarChar(mssql_1.default.MAX), cleanOptional(input.notes))
            .input("submittedIpAddress", mssql_1.default.NVarChar(64), cleanOptional(input.submittedIpAddress ?? undefined))
            .query(`
        INSERT INTO dbo.visits (
          visitor_id,
          gate_id,
          host_name,
          host_email,
          host_phone,
          host_department,
          purpose,
          valid_from,
          valid_until,
          license_plate,
          badge_number,
          status,
          created_via_public_form,
          submitted_ip_address,
          notes
        )
        OUTPUT inserted.id, inserted.status
        VALUES (
          @visitorId,
          NULL,
          @hostName,
          @hostEmail,
          @hostPhone,
          @hostDepartment,
          @purpose,
          @validFrom,
          @validUntil,
          @licensePlate,
          @badgeNumber,
          '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}',
          1,
          @submittedIpAddress,
          @notes
        )
      `);
        const visit = visitInsert.recordset[0];
        if (!visit) {
            throw new Error("visit_insert_failed");
        }
        await (0, auditLog_1.writeAuditLog)({
            user: `public:${cleanOptional(input.submittedIpAddress ?? undefined) ?? "unknown"}`,
            action: "PUBLIC_PRE_REGISTRATION_CREATED",
            objectType: "visit",
            objectId: visit.id,
            ipAddress: cleanOptional(input.submittedIpAddress ?? undefined),
            userAgent: cleanOptional(input.userAgent ?? undefined),
            metadata: {
                source: "public_pre_registration",
                created_via_public_form: true
            }
        }, transaction);
        await transaction.commit();
        return {
            visitId: visit.id,
            visitorId,
            status: visit.status
        };
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listActiveGates = listActiveGates;
exports.findActiveGateById = findActiveGateById;
exports.createPreRegistration = createPreRegistration;
const mssql_1 = __importDefault(require("mssql"));
const mailRelay_1 = require("./mailRelay");
const auditLog_1 = require("./auditLog");
const db_1 = require("./db");
const badgeAllocation_1 = require("./badgeAllocation");
const dateOnly_1 = require("./dateOnly");
const textValues_1 = require("./textValues");
const visitWorkflow_1 = require("./visitWorkflow");
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
async function findActiveGateById(id) {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request()
        .input("id", mssql_1.default.UniqueIdentifier, id)
        .query(`
      SELECT
        id,
        name,
        description,
        location
      FROM dbo.gates
      WHERE id = @id
        AND is_active = 1
    `);
    return result.recordset[0] ?? null;
}
async function createPreRegistration(input) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const gateId = (0, textValues_1.cleanOptional)(input.gateId);
        const gate = gateId ? await findActiveGateById(gateId) : null;
        const badgeNumber = await (0, badgeAllocation_1.generateUniqueBadgeNumber)(transaction);
        const fallbackDate = new Date().toISOString().slice(0, 10);
        const validFrom = input.validFrom || fallbackDate;
        const validUntil = input.validUntil || validFrom;
        const validFromDate = (0, dateOnly_1.dateOnlyStart)(validFrom);
        const validUntilDate = (0, dateOnly_1.dateOnlyEnd)(validUntil);
        const visitorInsert = await new mssql_1.default.Request(transaction)
            .input("firstName", mssql_1.default.NVarChar(120), input.firstName.trim())
            .input("lastName", mssql_1.default.NVarChar(120), input.lastName.trim())
            .input("company", mssql_1.default.NVarChar(255), input.company.trim())
            .input("visitorStreet", mssql_1.default.NVarChar(255), (0, textValues_1.cleanOptional)(input.visitorStreet))
            .input("visitorHouseNumber", mssql_1.default.NVarChar(40), (0, textValues_1.cleanOptional)(input.visitorHouseNumber))
            .input("visitorPostalCode", mssql_1.default.NVarChar(20), (0, textValues_1.cleanOptional)(input.visitorPostalCode))
            .input("visitorCity", mssql_1.default.NVarChar(120), (0, textValues_1.cleanOptional)(input.visitorCity))
            .input("nationalityCode", mssql_1.default.NChar(2), input.nationalityCode)
            .input("birthDate", mssql_1.default.Date, (0, textValues_1.cleanOptional)(input.birthDate))
            .input("phone", mssql_1.default.NVarChar(80), (0, textValues_1.cleanOptional)(input.phone))
            .input("email", mssql_1.default.NVarChar(255), (0, textValues_1.cleanOptional)(input.email))
            .input("idDocumentType", mssql_1.default.NVarChar(40), (0, textValues_1.cleanOptional)(input.idDocumentType))
            .input("idDocumentValidUntil", mssql_1.default.Date, (0, textValues_1.cleanOptional)(input.idDocumentValidUntil))
            .input("idDocumentNumber", mssql_1.default.NVarChar(120), (0, textValues_1.cleanOptional)(input.idDocumentNumber))
            .query(`
        INSERT INTO dbo.visitors (
          first_name,
          last_name,
          company,
          visitor_street,
          visitor_house_number,
          visitor_postal_code,
          visitor_city,
          nationality_code,
          birth_date,
          phone_optional,
          email_optional,
          id_document_type,
          id_document_valid_until,
          id_document_number
        )
        OUTPUT inserted.id
        VALUES (
          @firstName,
          @lastName,
          @company,
          @visitorStreet,
          @visitorHouseNumber,
          @visitorPostalCode,
          @visitorCity,
          @nationalityCode,
          @birthDate,
          @phone,
          @email,
          @idDocumentType,
          @idDocumentValidUntil,
          @idDocumentNumber
        )
      `);
        const visitorId = visitorInsert.recordset[0]?.id;
        if (!visitorId) {
            throw new Error("visitor_insert_failed");
        }
        const visitInsert = await new mssql_1.default.Request(transaction)
            .input("visitorId", mssql_1.default.UniqueIdentifier, visitorId)
            .input("gateId", mssql_1.default.UniqueIdentifier, gateId)
            .input("hostName", mssql_1.default.NVarChar(255), input.hostName.trim())
            .input("hostEmail", mssql_1.default.NVarChar(255), (0, textValues_1.cleanOptional)(input.hostEmail)?.toLowerCase() ?? null)
            .input("hostPhone", mssql_1.default.NVarChar(80), (0, textValues_1.cleanOptional)(input.hostPhone))
            .input("hostDepartment", mssql_1.default.NVarChar(255), (0, textValues_1.cleanOptional)(input.hostDepartment))
            .input("purpose", mssql_1.default.NVarChar(500), input.purpose.trim())
            .input("validFrom", mssql_1.default.DateTime2, validFromDate)
            .input("validUntil", mssql_1.default.DateTime2, validUntilDate)
            .input("licensePlate", mssql_1.default.NVarChar(40), (0, textValues_1.cleanOptional)(input.licensePlate))
            .input("badgeNumber", mssql_1.default.NVarChar(64), badgeNumber)
            .input("notes", mssql_1.default.NVarChar(mssql_1.default.MAX), (0, textValues_1.cleanOptional)(input.notes))
            .input("submittedIpAddress", mssql_1.default.NVarChar(64), (0, textValues_1.cleanOptional)(input.submittedIpAddress ?? undefined))
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
          @gateId,
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
            user: `public:${(0, textValues_1.cleanOptional)(input.submittedIpAddress ?? undefined) ?? "unknown"}`,
            action: "PUBLIC_PRE_REGISTRATION_CREATED",
            objectType: "visit",
            objectId: visit.id,
            ipAddress: (0, textValues_1.cleanOptional)(input.submittedIpAddress ?? undefined),
            userAgent: (0, textValues_1.cleanOptional)(input.userAgent ?? undefined),
            metadata: {
                source: "public_pre_registration",
                created_via_public_form: true
            }
        }, transaction);
        await transaction.commit();
        if (input.hostEmail) {
            void (0, mailRelay_1.sendPreRegistrationConfirmation)({
                to: input.hostEmail,
                visitorName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
                company: input.company.trim(),
                hostName: input.hostName.trim(),
                purpose: input.purpose.trim(),
                validFrom: validFromDate,
                validUntil: validUntilDate,
                gateName: gate?.name ?? null,
                visitId: visit.id
            }).then(async (delivered) => {
                if (delivered) {
                    const pool = await (0, db_1.getPool)();
                    await pool.request().input("id", mssql_1.default.UniqueIdentifier, visit.id).query("UPDATE dbo.visits SET confirmation_sent_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id");
                }
            }).catch(() => undefined);
        }
        if (input.nationalityCode) {
            void (0, mailRelay_1.notifyNationalitySubscribers)({
                visitId: visit.id,
                nationalityCode: input.nationalityCode,
                visitorName: `${input.firstName.trim()} ${input.lastName.trim()}`,
                company: input.company.trim(),
                validFrom,
                validUntil,
                gateName: gate?.name ?? null
            });
        }
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

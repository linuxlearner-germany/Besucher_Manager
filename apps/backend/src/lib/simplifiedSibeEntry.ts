import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { generateUniqueBadgeNumber } from "./badgeAllocation";
import { dateOnlyEnd, dateOnlyStart } from "./dateOnly";
import { getPool } from "./db";
import { findActiveGateById } from "./publicPreRegistrations";
import { canCreateSimplifiedSibeEntry } from "./simplifiedSibeEntryAuthorization";
import type { SimplifiedSibeEntryInput } from "./simplifiedSibeEntrySchema";
import { cleanOptional } from "./textValues";
import { VISIT_STATUS, type AuthenticatedUser } from "./visitWorkflow";

export async function createSimplifiedSibeEntry(
  user: AuthenticatedUser,
  input: SimplifiedSibeEntryInput,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<{ visitId: string; visitorId: string; badgeNumber: string; status: string }> {
  if (!canCreateSimplifiedSibeEntry(user)) throw new Error("simplified_sibe_entry_forbidden");

  const gate = await findActiveGateById(input.gateId);
  if (!gate) throw new Error("simplified_sibe_gate_not_found");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visitorInsert = await new sql.Request(transaction)
      .input("firstName", sql.NVarChar(120), cleanOptional(input.firstName))
      .input("lastName", sql.NVarChar(120), cleanOptional(input.lastName))
      .input("company", sql.NVarChar(255), cleanOptional(input.company))
      .input("nationalityCode", sql.NChar(2), input.nationalityCode)
      .input("birthDate", sql.Date, cleanOptional(input.birthDate))
      .input("phone", sql.NVarChar(80), cleanOptional(input.phone))
      .input("email", sql.NVarChar(255), cleanOptional(input.email))
      .input("visitorStreet", sql.NVarChar(255), cleanOptional(input.visitorStreet))
      .input("visitorHouseNumber", sql.NVarChar(40), cleanOptional(input.visitorHouseNumber))
      .input("visitorPostalCode", sql.NVarChar(20), cleanOptional(input.visitorPostalCode))
      .input("visitorCity", sql.NVarChar(120), cleanOptional(input.visitorCity))
      .input("idDocumentType", sql.NVarChar(40), cleanOptional(input.idDocumentType))
      .input("idDocumentValidUntil", sql.Date, cleanOptional(input.idDocumentValidUntil))
      .input("idDocumentNumber", sql.NVarChar(120), cleanOptional(input.idDocumentNumber))
      .query<{ id: string }>(`
        INSERT INTO dbo.visitors (
          first_name, last_name, company, nationality_code, birth_date,
          phone_optional, email_optional, visitor_street, visitor_house_number,
          visitor_postal_code, visitor_city, id_document_type,
          id_document_valid_until, id_document_number
        )
        OUTPUT inserted.id
        VALUES (
          @firstName, @lastName, @company, @nationalityCode, @birthDate,
          @phone, @email, @visitorStreet, @visitorHouseNumber,
          @visitorPostalCode, @visitorCity, @idDocumentType,
          @idDocumentValidUntil, @idDocumentNumber
        )
      `);

    const visitorId = visitorInsert.recordset[0]?.id;
    if (!visitorId) throw new Error("visitor_insert_failed");

    const badgeNumber = await generateUniqueBadgeNumber(transaction);
    const expectedArrivalTime = input.expectedArrivalTime
      ? new Date(`1970-01-01T${input.expectedArrivalTime}:00.000Z`)
      : null;
    const visitInsert = await new sql.Request(transaction)
      .input("visitorId", sql.UniqueIdentifier, visitorId)
      .input("gateId", sql.UniqueIdentifier, gate.id)
      .input("hostName", sql.NVarChar(255), cleanOptional(input.hostName))
      .input("hostEmail", sql.NVarChar(255), cleanOptional(input.hostEmail)?.toLowerCase() ?? null)
      .input("hostPhone", sql.NVarChar(80), cleanOptional(input.hostPhone))
      .input("hostDepartment", sql.NVarChar(255), cleanOptional(input.hostDepartment))
      .input("purpose", sql.NVarChar(500), cleanOptional(input.purpose))
      .input("validFrom", sql.DateTime2, dateOnlyStart(input.validFrom))
      .input("validUntil", sql.DateTime2, dateOnlyEnd(input.validUntil))
      .input("expectedArrivalTime", sql.Time, expectedArrivalTime)
      .input("licensePlate", sql.NVarChar(40), cleanOptional(input.licensePlate))
      .input("badgeNumber", sql.NVarChar(64), badgeNumber)
      .input("notes", sql.NVarChar(sql.MAX), cleanOptional(input.notes))
      .input("createdBy", sql.UniqueIdentifier, user.id)
      .query<{ id: string; status: string }>(`
        INSERT INTO dbo.visits (
          visitor_id, gate_id, host_name, host_email, host_phone, host_department,
          purpose, valid_from, valid_until, expected_arrival_time, license_plate,
          badge_number, status, created_by, created_via_public_form, notes, source
        )
        OUTPUT inserted.id, inserted.status
        VALUES (
          @visitorId, @gateId, @hostName, @hostEmail, @hostPhone, @hostDepartment,
          @purpose, @validFrom, @validUntil, @expectedArrivalTime, @licensePlate,
          @badgeNumber, '${VISIT_STATUS.PRE_REGISTERED}', @createdBy, 0, @notes, N'simplified_web'
        )
      `);

    const visit = visitInsert.recordset[0];
    if (!visit) throw new Error("visit_insert_failed");

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_SIMPLIFIED_VISIT_CREATED",
      objectType: "visit",
      objectId: visit.id,
      ipAddress,
      userAgent,
      metadata: {
        source: "sibe_simplified_entry",
        gateId: gate.id,
        visitorId,
        optionalPersonalDataProvided: Boolean(
          input.firstName || input.lastName || input.company || input.nationalityCode
          || input.birthDate || input.email || input.phone || input.idDocumentNumber
        )
      }
    }, transaction);

    await transaction.commit();
    return { visitId: visit.id, visitorId, badgeNumber, status: visit.status };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

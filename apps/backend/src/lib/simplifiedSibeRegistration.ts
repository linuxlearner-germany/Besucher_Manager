import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { getPool } from "./db";
import type { SimplifiedSibeVisitorInput } from "./simplifiedSibeRegistrationSchema";
import type { AuthenticatedUser } from "./visitWorkflow";

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createSimplifiedSibeVisitor(
  user: AuthenticatedUser,
  input: SimplifiedSibeVisitorInput,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<{ visitorId: string }> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const inserted = await new sql.Request(transaction)
      .input("firstName", sql.NVarChar(120), input.firstName)
      .input("lastName", sql.NVarChar(120), input.lastName)
      .input("company", sql.NVarChar(255), input.company)
      .input("nationalityCode", sql.NChar(2), input.nationalityCode)
      .input("birthDate", sql.Date, optional(input.birthDate))
      .input("phone", sql.NVarChar(80), optional(input.phone))
      .input("email", sql.NVarChar(255), optional(input.email))
      .input("visitorStreet", sql.NVarChar(255), optional(input.visitorStreet))
      .input("visitorHouseNumber", sql.NVarChar(40), optional(input.visitorHouseNumber))
      .input("visitorPostalCode", sql.NVarChar(20), optional(input.visitorPostalCode))
      .input("visitorCity", sql.NVarChar(120), optional(input.visitorCity))
      .input("idDocumentType", sql.NVarChar(40), optional(input.idDocumentType))
      .input("idDocumentValidUntil", sql.Date, optional(input.idDocumentValidUntil))
      .input("idDocumentNumber", sql.NVarChar(120), optional(input.idDocumentNumber))
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

    const visitorId = inserted.recordset[0]?.id;
    if (!visitorId) throw new Error("visitor_insert_failed");

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_SIMPLIFIED_VISITOR_CREATED",
      objectType: "visitor",
      objectId: visitorId,
      ipAddress,
      userAgent,
      metadata: { simplifiedVisitorRule: true }
    }, transaction);

    await transaction.commit();
    return { visitorId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

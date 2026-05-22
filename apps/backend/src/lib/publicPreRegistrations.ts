import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { getPool } from "./db";
import type { PublicPreRegistrationInput } from "./publicPreRegistrationSchema";
import { VISIT_STATUS } from "./visitWorkflow";

export type GateSummary = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
};

export type CreatePreRegistrationInput = PublicPreRegistrationInput & {
  submittedIpAddress?: string | null;
  userAgent?: string | null;
};

export type CreatedPreRegistration = {
  visitId: string;
  visitorId: string;
  status: string;
};

function cleanOptional(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function listActiveGates(): Promise<GateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<GateSummary>(`
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

export async function createPreRegistration(input: CreatePreRegistrationInput): Promise<CreatedPreRegistration> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const gateCheck = await new sql.Request(transaction)
      .input("gateId", sql.UniqueIdentifier, input.gateId)
      .query<{ id: string }>(`
      SELECT id
      FROM dbo.gates
      WHERE id = @gateId AND is_active = 1
    `);

    if (gateCheck.recordset.length === 0) {
      throw new Error("gate_not_found");
    }

    const visitorInsert = await new sql.Request(transaction)
      .input("firstName", sql.NVarChar(120), input.firstName.trim())
      .input("lastName", sql.NVarChar(120), input.lastName.trim())
      .input("company", sql.NVarChar(255), input.company.trim())
      .input("birthDate", sql.Date, cleanOptional(input.birthDate))
      .input("phone", sql.NVarChar(80), cleanOptional(input.phone))
      .input("email", sql.NVarChar(255), cleanOptional(input.email))
      .query<{ id: string }>(`
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

    const visitInsert = await new sql.Request(transaction)
      .input("visitorId", sql.UniqueIdentifier, visitorId)
      .input("gateId", sql.UniqueIdentifier, input.gateId)
      .input("hostName", sql.NVarChar(255), input.hostName.trim())
      .input("hostEmail", sql.NVarChar(255), cleanOptional(input.hostEmail))
      .input("hostPhone", sql.NVarChar(80), cleanOptional(input.hostPhone))
      .input("hostDepartment", sql.NVarChar(255), input.hostDepartment.trim())
      .input("purpose", sql.NVarChar(500), input.purpose.trim())
      .input("validFrom", sql.DateTime2, new Date(input.validFrom))
      .input("validUntil", sql.DateTime2, new Date(input.validUntil))
      .input("licensePlate", sql.NVarChar(40), cleanOptional(input.licensePlate))
      .input("notes", sql.NVarChar(sql.MAX), cleanOptional(input.notes))
      .input("submittedIpAddress", sql.NVarChar(64), cleanOptional(input.submittedIpAddress ?? undefined))
      .query<{ id: string; status: string }>(`
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
          '${VISIT_STATUS.PRE_REGISTERED}',
          1,
          @submittedIpAddress,
          @notes
        )
      `);

    const visit = visitInsert.recordset[0];

    if (!visit) {
      throw new Error("visit_insert_failed");
    }

    await writeAuditLog(
      {
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
      },
      transaction
    );

    await transaction.commit();

    return {
      visitId: visit.id,
      visitorId,
      status: visit.status
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

import sql from "mssql";
import { notifyApprovalRequested } from "./mailRelay";
import { writeAuditLog } from "./auditLog";
import { getPool } from "./db";
import { generateBadgeNumberCandidate } from "./badgeNumber";
import type { PublicPreRegistrationInput } from "./publicPreRegistrationSchema";
import { loadWorkflowSettings } from "./systemSettings";
import { APPROVAL_STATUS, VISIT_STATUS } from "./visitWorkflow";

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
  approvalStatus: string;
};

async function generateUniqueBadgeNumber(transaction: sql.Transaction): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateBadgeNumberCandidate();
    const existing = await new sql.Request(transaction)
      .input("badgeNumber", sql.NVarChar(64), candidate)
      .query<{ id: string }>(`
        SELECT TOP 1 v.id
        FROM dbo.visits v
        INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
        WHERE v.badge_number = @badgeNumber
          AND vis.is_deleted = 0
          AND v.status <> '${VISIT_STATUS.CANCELLED}'
      `);

    if (existing.recordset.length === 0) {
      return candidate;
    }
  }

  throw new Error("badge_number_generation_failed");
}

function cleanOptional(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDateOnlyStart(value: string): Date {
  const parsed = new Date(value);
  const utcYear = parsed.getUTCFullYear();
  const utcMonth = parsed.getUTCMonth();
  const utcDay = parsed.getUTCDate();
  return new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
}

function normalizeDateOnlyEnd(value: string): Date {
  const parsed = new Date(value);
  const utcYear = parsed.getUTCFullYear();
  const utcMonth = parsed.getUTCMonth();
  const utcDay = parsed.getUTCDate();
  return new Date(Date.UTC(utcYear, utcMonth, utcDay, 23, 59, 59, 999));
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

export async function findActiveGateById(id: string): Promise<GateSummary | null> {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .query<GateSummary>(`
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

export async function createPreRegistration(input: CreatePreRegistrationInput): Promise<CreatedPreRegistration> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const workflowSettings = await loadWorkflowSettings({ transaction });
    const approvalStatus = workflowSettings.approvalRequired
      ? APPROVAL_STATUS.PENDING
      : APPROVAL_STATUS.NOT_REQUIRED;
    const gateId = cleanOptional(input.gateId);
    const badgeNumber = await generateUniqueBadgeNumber(transaction);

    const visitorInsert = await new sql.Request(transaction)
      .input("firstName", sql.NVarChar(120), input.firstName.trim())
      .input("lastName", sql.NVarChar(120), input.lastName.trim())
      .input("company", sql.NVarChar(255), input.company.trim())
      .input("birthDate", sql.Date, cleanOptional(input.birthDate))
      .input("phone", sql.NVarChar(80), cleanOptional(input.phone))
      .input("email", sql.NVarChar(255), cleanOptional(input.email))
      .input("idDocumentType", sql.NVarChar(40), cleanOptional(input.idDocumentType))
      .input("idDocumentValidUntil", sql.Date, cleanOptional(input.idDocumentValidUntil))
      .input("idDocumentNumber", sql.NVarChar(120), cleanOptional(input.idDocumentNumber))
      .query<{ id: string }>(`
        INSERT INTO dbo.visitors (
          first_name,
          last_name,
          company,
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

    const visitInsert = await new sql.Request(transaction)
      .input("visitorId", sql.UniqueIdentifier, visitorId)
      .input("gateId", sql.UniqueIdentifier, gateId)
      .input("hostName", sql.NVarChar(255), input.hostName.trim())
      .input("hostEmail", sql.NVarChar(255), cleanOptional(input.hostEmail))
      .input("hostPhone", sql.NVarChar(80), cleanOptional(input.hostPhone))
      .input("hostDepartment", sql.NVarChar(255), cleanOptional(input.hostDepartment))
      .input("purpose", sql.NVarChar(500), input.purpose.trim())
      .input("validFrom", sql.DateTime2, normalizeDateOnlyStart(input.validFrom))
      .input("validUntil", sql.DateTime2, normalizeDateOnlyEnd(input.validUntil))
      .input("licensePlate", sql.NVarChar(40), cleanOptional(input.licensePlate))
      .input("badgeNumber", sql.NVarChar(64), badgeNumber)
      .input("notes", sql.NVarChar(sql.MAX), cleanOptional(input.notes))
      .input("approvalStatus", sql.NVarChar(32), approvalStatus)
      .input("submittedIpAddress", sql.NVarChar(64), cleanOptional(input.submittedIpAddress ?? undefined))
      .query<{ id: string; status: string; approvalStatus: string }>(`
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
          approval_status,
          created_via_public_form,
          submitted_ip_address,
          notes
        )
        OUTPUT inserted.id, inserted.status, inserted.approval_status AS approvalStatus
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
          '${VISIT_STATUS.PRE_REGISTERED}',
          @approvalStatus,
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

    if (visit.approvalStatus === APPROVAL_STATUS.PENDING) {
      const gate = gateId ? await findActiveGateById(gateId) : null;
      void notifyApprovalRequested({
        visitId: visit.id,
        visitorName: `${input.firstName.trim()} ${input.lastName.trim()}`,
        company: input.company.trim(),
        hostName: input.hostName.trim(),
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        gateName: gate?.name ?? null
      });
    }

    return {
      visitId: visit.id,
      visitorId,
      status: visit.status,
      approvalStatus: visit.approvalStatus
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

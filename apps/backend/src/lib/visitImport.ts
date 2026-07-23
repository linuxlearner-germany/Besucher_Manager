import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { generateBadgeNumberCandidate } from "./badgeNumber";
import { getPool } from "./db";
import { findCountryCode } from "./countries";
import { notifyNationalitySubscribers } from "./mailRelay";
import { findActiveGateById, listActiveGates } from "./publicPreRegistrations";
import { getVisitCompleteness } from "./guardVisits";
import type { ImportVisitInput, ImportVisitResult, ImportVisitsResult } from "./visitImportDefinitions";
import { VISIT_STATUS, type AuthenticatedUser } from "./visitWorkflow";

export const MISSING_IMPORT_VALUE = "[fehlt]";

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isMissingImportValue(value: string | null | undefined): boolean {
  const normalized = cleanOptional(value)?.toLowerCase();
  return !normalized || normalized === MISSING_IMPORT_VALUE || normalized === MISSING_IMPORT_VALUE.toLowerCase();
}

function requiredOrPlaceholder(value: string | null | undefined): string {
  return cleanOptional(value) ?? MISSING_IMPORT_VALUE;
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) {
    return null;
  }

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const germanDate = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function normalizeIdDocumentType(value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.toLowerCase().replace(/[\s_-]+/g, "");
  if (["personalausweis", "identitycard", "ausweis", "idcard"].includes(normalized)) {
    return "identity_card";
  }
  if (["reisepass", "pass", "passport"].includes(normalized)) {
    return "passport";
  }
  if (["dienstausweis", "serviceid", "servicecard"].includes(normalized)) {
    return "service_id";
  }
  if (["sonstiges", "sonstige", "other"].includes(normalized)) {
    return "other";
  }

  return cleaned;
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

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

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

async function resolveGateId(row: ImportVisitInput, fallbackGateId?: string | null): Promise<string | null> {
  const explicitGateId = cleanOptional(row.gateId);
  if (explicitGateId) {
    const gate = await findActiveGateById(explicitGateId);
    return gate?.id ?? fallbackGateId ?? null;
  }

  const gateName = cleanOptional(row.gateName);
  if (gateName) {
    const gates = await listActiveGates();
    const normalizedGateName = gateName.toLowerCase();
    const gate = gates.find((entry) => entry.name.toLowerCase() === normalizedGateName);
    return gate?.id ?? fallbackGateId ?? null;
  }

  return fallbackGateId ?? null;
}

export async function createImportedPreRegistrations(
  rows: ImportVisitInput[],
  options: {
    source: "public_group_form" | "file_import";
    submittedIpAddress?: string | null;
    userAgent?: string | null;
    createdBy?: AuthenticatedUser | null;
    fallbackGateId?: string | null;
  }
): Promise<ImportVisitsResult> {
  const invalidNationalityRows = rows.flatMap((row, index) =>
    findCountryCode(row.nationalityCode) ? [] : [index + 2]
  );
  if (invalidNationalityRows.length > 0) {
    const error = new Error("invalid_import_nationalities") as Error & { rows: number[] };
    error.rows = invalidNationalityRows;
    throw error;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const importedRows: ImportVisitResult[] = [];
    const nationalityNotifications: Array<{
      visitId: string;
      nationalityCode: string;
      visitorName: string;
      company: string;
      validFrom: string;
      validUntil: string;
      gateName: string | null;
    }> = [];

    for (const [index, row] of rows.entries()) {
      const badgeNumber = await generateUniqueBadgeNumber(transaction);
      const validFrom = normalizeDateOnly(row.validFrom) ?? todayDateOnly();
      const validUntil = normalizeDateOnly(row.validUntil) ?? validFrom;
      const idDocumentValidUntil = normalizeDateOnly(row.idDocumentValidUntil);
      const idDocumentType = normalizeIdDocumentType(row.idDocumentType);
      const birthDate = normalizeDateOnly(row.birthDate);
      const gateId = await resolveGateId(row, options.fallbackGateId);
      const nationalityCode = findCountryCode(row.nationalityCode)!;

      const visitorInsert = await new sql.Request(transaction)
        .input("firstName", sql.NVarChar(120), requiredOrPlaceholder(row.firstName))
        .input("lastName", sql.NVarChar(120), requiredOrPlaceholder(row.lastName))
        .input("company", sql.NVarChar(255), requiredOrPlaceholder(row.company))
        .input("nationalityCode", sql.NChar(2), nationalityCode)
        .input("birthDate", sql.Date, birthDate)
        .input("phone", sql.NVarChar(80), cleanOptional(row.phone))
        .input("email", sql.NVarChar(255), cleanOptional(row.email))
        .input("idDocumentType", sql.NVarChar(40), idDocumentType)
        .input("idDocumentValidUntil", sql.Date, idDocumentValidUntil)
        .input("idDocumentNumber", sql.NVarChar(120), cleanOptional(row.idDocumentNumber))
        .query<{ id: string }>(`
          INSERT INTO dbo.visitors (
            first_name,
            last_name,
            company,
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

      const visitInsert = await new sql.Request(transaction)
        .input("visitorId", sql.UniqueIdentifier, visitorId)
        .input("gateId", sql.UniqueIdentifier, gateId)
        .input("hostName", sql.NVarChar(255), requiredOrPlaceholder(row.hostName))
        .input("hostEmail", sql.NVarChar(255), cleanOptional(row.hostEmail))
        .input("hostPhone", sql.NVarChar(80), cleanOptional(row.hostPhone))
        .input("hostDepartment", sql.NVarChar(255), cleanOptional(row.hostDepartment))
        .input("purpose", sql.NVarChar(500), requiredOrPlaceholder(row.purpose))
        .input("validFrom", sql.DateTime2, normalizeDateOnlyStart(validFrom))
        .input("validUntil", sql.DateTime2, normalizeDateOnlyEnd(validUntil))
        .input("licensePlate", sql.NVarChar(40), cleanOptional(row.licensePlate))
        .input("badgeNumber", sql.NVarChar(64), badgeNumber)
        .input("notes", sql.NVarChar(sql.MAX), cleanOptional(row.notes))
        .input("createdBy", sql.UniqueIdentifier, options.createdBy?.id ?? null)
        .input("submittedIpAddress", sql.NVarChar(64), cleanOptional(options.submittedIpAddress))
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
            badge_number,
            status,
            created_by,
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
            '${VISIT_STATUS.PRE_REGISTERED}',
            @createdBy,
            ${options.source === "public_group_form" ? "1" : "0"},
            @submittedIpAddress,
            @notes
          )
        `);

      const visit = visitInsert.recordset[0];
      if (!visit) {
        throw new Error("visit_insert_failed");
      }

      const completeness = getVisitCompleteness({
        status: VISIT_STATUS.PRE_REGISTERED,
        firstName: requiredOrPlaceholder(row.firstName),
        lastName: requiredOrPlaceholder(row.lastName),
        company: requiredOrPlaceholder(row.company),
        nationalityCode,
        hostName: requiredOrPlaceholder(row.hostName),
        hostPhone: cleanOptional(row.hostPhone),
        purpose: requiredOrPlaceholder(row.purpose),
        validFrom,
        validUntil,
        gateId,
        badgeNumber,
        checkOutAt: null,
        birthDate,
        visitorPhone: cleanOptional(row.phone),
        visitorEmail: cleanOptional(row.email),
        licensePlate: cleanOptional(row.licensePlate),
        idDocumentType,
        idDocumentValidUntil,
        idDocumentNumber: cleanOptional(row.idDocumentNumber),
        idDocumentIssuingPlace: null
      });

      importedRows.push({
        rowNumber: index + 1,
        visitId: visit.id,
        visitorId,
        badgeNumber,
        visitorName: `${requiredOrPlaceholder(row.firstName)} ${requiredOrPlaceholder(row.lastName)}`,
        company: requiredOrPlaceholder(row.company),
        missingFields: completeness.errors.map((issue) => issue.message),
        warnings: completeness.warnings.map((issue) => issue.message),
        needsReview: completeness.errors.length > 0 || completeness.warnings.length > 0
      });

      const gate = gateId ? await findActiveGateById(gateId) : null;
      nationalityNotifications.push({
        visitId: visit.id,
        nationalityCode,
        visitorName: `${requiredOrPlaceholder(row.firstName)} ${requiredOrPlaceholder(row.lastName)}`,
        company: requiredOrPlaceholder(row.company),
        validFrom,
        validUntil,
        gateName: gate?.name ?? null
      });
    }

    await writeAuditLog(
      {
        user: options.createdBy?.username ?? `public:${cleanOptional(options.submittedIpAddress) ?? "unknown"}`,
        userId: options.createdBy?.id,
        action: options.source === "file_import" ? "VISITS_IMPORTED_FROM_FILE" : "PUBLIC_GROUP_PRE_REGISTRATION_CREATED",
        objectType: "visit",
        objectId: "bulk",
        ipAddress: cleanOptional(options.submittedIpAddress),
        userAgent: cleanOptional(options.userAgent),
        metadata: {
          source: options.source,
          imported: importedRows.length,
          needs_review: importedRows.filter((row) => row.needsReview).length
        }
      },
      transaction
    );

    await transaction.commit();

    for (const notification of nationalityNotifications) {
      void notifyNationalitySubscribers(notification);
    }

    return {
      imported: importedRows.length,
      needsReview: importedRows.filter((row) => row.needsReview).length,
      rows: importedRows
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

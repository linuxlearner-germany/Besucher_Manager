import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { generateUniqueBadgeNumber } from "./badgeAllocation";
import { getPool } from "./db";
import { dateOnlyEnd, dateOnlyStart } from "./dateOnly";
import { cleanOptional, cleanRequired, isBlankOrPlaceholder } from "./textValues";
import { findCountryCode } from "./countries";
import { notifyNationalitySubscribers } from "./mailRelay";
import { findActiveGateById, listActiveGates } from "./publicPreRegistrations";
import { getVisitCompleteness } from "./guardVisits";
import type { ImportVisitInput, ImportVisitResult, ImportVisitsResult } from "./visitImportDefinitions";
import { validateImportedPreRegistrationRows, type PublicFieldKey } from "./publicPreRegistrationSchema";
import { VISIT_STATUS, type AuthenticatedUser } from "./visitWorkflow";

export const MISSING_IMPORT_VALUE = "[fehlt]";

export class ImportValidationError extends Error {
  constructor(public readonly messages: string[]) {
    super("invalid_import_data");
  }
}

export function isMissingImportValue(value: string | null | undefined): boolean {
  return isBlankOrPlaceholder(value, MISSING_IMPORT_VALUE);
}

function requiredOrPlaceholder(value: string | null | undefined): string {
  return cleanRequired(value, MISSING_IMPORT_VALUE);
}

export function normalizeImportDateOnly(value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) {
    return null;
  }

  const germanDate = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
  }

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
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

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
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
    source: "public_group_form";
    submittedIpAddress?: string | null;
    userAgent?: string | null;
    createdBy?: AuthenticatedUser | null;
    fallbackGateId?: string | null;
    requiredPublicFieldKeys?: ReadonlySet<PublicFieldKey>;
  }
): Promise<ImportVisitsResult> {
  if (options.requiredPublicFieldKeys) {
    const validationMessages = validateImportedPreRegistrationRows(rows, options.requiredPublicFieldKeys);
    if (validationMessages.length > 0) {
      throw new ImportValidationError(validationMessages);
    }
  }

  const invalidNationalityRows = rows.flatMap((row, index) =>
    findCountryCode(row.nationalityCode) ? [] : [row.sourceExcelRowNumber ?? index + 2]
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
      const validFrom = normalizeImportDateOnly(row.validFrom) ?? todayDateOnly();
      const validUntil = normalizeImportDateOnly(row.validUntil) ?? validFrom;
      const idDocumentValidUntil = normalizeImportDateOnly(row.idDocumentValidUntil);
      const idDocumentType = normalizeIdDocumentType(row.idDocumentType);
      const birthDate = normalizeImportDateOnly(row.birthDate);
      const gateId = await resolveGateId(row, options.fallbackGateId);
      const nationalityCode = findCountryCode(row.nationalityCode)!;

      const visitorInsert = await new sql.Request(transaction)
        .input("firstName", sql.NVarChar(120), requiredOrPlaceholder(row.firstName))
        .input("lastName", sql.NVarChar(120), requiredOrPlaceholder(row.lastName))
        .input("company", sql.NVarChar(255), requiredOrPlaceholder(row.company))
        .input("nationalityCode", sql.NChar(2), nationalityCode)
        .input("birthDate", sql.Date, birthDate)
        .input("visitorStreet", sql.NVarChar(255), cleanOptional(row.visitorStreet))
        .input("visitorHouseNumber", sql.NVarChar(40), cleanOptional(row.visitorHouseNumber))
        .input("visitorPostalCode", sql.NVarChar(20), cleanOptional(row.visitorPostalCode))
        .input("visitorCity", sql.NVarChar(120), cleanOptional(row.visitorCity))
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
            visitor_street,
            visitor_house_number,
            visitor_postal_code,
            visitor_city,
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
            @visitorStreet,
            @visitorHouseNumber,
            @visitorPostalCode,
            @visitorCity,
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
        .input("validFrom", sql.DateTime2, dateOnlyStart(validFrom))
        .input("validUntil", sql.DateTime2, dateOnlyEnd(validUntil))
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
        visitorStreet: cleanOptional(row.visitorStreet),
        visitorHouseNumber: cleanOptional(row.visitorHouseNumber),
        visitorPostalCode: cleanOptional(row.visitorPostalCode),
        visitorCity: cleanOptional(row.visitorCity),
        visitorAddress: null,
        idDocumentType,
        idDocumentValidUntil,
        idDocumentNumber: cleanOptional(row.idDocumentNumber),
        idDocumentIssuingPlace: null
      });

      importedRows.push({
        rowNumber: row.sourceExcelRowNumber ?? index + 1,
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
        action: "PUBLIC_GROUP_PRE_REGISTRATION_CREATED",
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

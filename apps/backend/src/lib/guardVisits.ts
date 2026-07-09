import sql from "mssql";
import { getPool } from "./db";
import { writeAuditLog } from "./auditLog";
import { loadCompletenessFieldConfig, type CompletenessFieldConfig } from "./fieldDefinitions";
import {
  APPROVAL_STATUS,
  assertCanCheckIn,
  assertCanCheckOut,
  assertVisitApprovedForCheckIn,
  assertReturnedBadgeNumberMatches,
  assertCanUpdateHostSignature,
  canAccessGate,
  canManageGuardScopedVisit,
  HOST_SIGNATURE_STATUS,
  type AuthenticatedUser,
  type ApprovalStatus,
  type HostSignatureStatus,
  VISIT_STATUS
} from "./visitWorkflow";

const MISSING_IMPORT_VALUE = "[fehlt]";

export type GuardVisitListItem = {
  id: string;
  status: string;
  approvalStatus: ApprovalStatus;
  approvalNote: string | null;
  approvalDecidedBy: string | null;
  approvalDecidedAt: string | null;
  validFrom: string;
  validUntil: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  firstName: string;
  lastName: string;
  company: string;
  birthDate: string | null;
  visitorPhone: string | null;
  visitorEmail: string | null;
  hostName: string;
  hostEmail: string | null;
  hostPhone: string | null;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  gateName: string;
  licensePlate: string | null;
  signedByHostConfirmed: boolean;
  hostSignatureStatus: HostSignatureStatus;
  hostSignatureDate: string | null;
  hostSignatureNote: string | null;
  hostSignatureConfirmedBy: string | null;
  hostSignatureConfirmedAt: string | null;
  checkoutNote: string | null;
  badgeNumber: string | null;
  visitorStreet: string | null;
  visitorHouseNumber: string | null;
  visitorPostalCode: string | null;
  visitorCity: string | null;
  visitorAddress: string | null;
  idDocumentType: string | null;
  idDocumentValidUntil: string | null;
  idDocumentNumber: string | null;
  idDocumentIssuingPlace: string | null;
  visitPurposeType: string | null;
  visitCompanyOrder: string | null;
  hostUnit: string | null;
  hostBuilding: string | null;
  hostRoom: string | null;
  hostExtension: string | null;
  visitEndType: string | null;
  forwardedToNote: string | null;
  devicePhotoApp: boolean | null;
  deviceFilmApp: boolean | null;
  deviceVideoCamera: boolean | null;
  deviceManufacturer: string | null;
  deviceSerialNumber: string | null;
  deviceAccessories: string | null;
  deviceDepositNote: string | null;
  deviceReturnConfirmed: boolean | null;
  deviceReturnedAt: string | null;
  deviceReturnedBy: string | null;
  checkInBy: string | null;
  checkOutBy: string | null;
};

export type VisitDetail = GuardVisitListItem & {
  notes: string | null;
  badgeNumber: string | null;
  siteMap: { id: string; name: string; filePath: string } | null;
  badgeTexts: Array<{ id: string; name: string; textType: string; content: string }>;
  completeness: VisitCompleteness;
};

export type VisitCompletenessIssue = {
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
};

export type VisitCompleteness = {
  canCheckIn: boolean;
  canPrintBadge: boolean;
  canCheckOut: boolean;
  missingRequiredFields: string[];
  errors: VisitCompletenessIssue[];
  warnings: VisitCompletenessIssue[];
  infos: VisitCompletenessIssue[];
};

export type GuardCalendarVisitItem = {
  id: string;
  badgeNumber: string | null;
  status: string;
  visitorName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateName: string;
  validFrom: string;
  validUntil: string;
  isUnassigned: boolean;
  licensePlate: string | null;
};

type VisitScopeRow = {
  id: string;
  gateId: string | null;
  status: string;
  approvalStatus?: ApprovalStatus | null;
  badgeNumber?: string | null;
  visitorId?: string;
  validFrom?: Date;
  hostSignatureStatus?: HostSignatureStatus | null;
  hostSignatureDate?: Date | null;
  hostSignatureNote?: string | null;
  hostSignatureConfirmedBy?: string | null;
  hostSignatureConfirmedAt?: Date | null;
};

const normalizedStatusSql = `
  CASE
    WHEN v.status = 'vorangemeldet' THEN '${VISIT_STATUS.PRE_REGISTERED}'
    WHEN v.status = 'eingecheckt' THEN '${VISIT_STATUS.CHECKED_IN}'
    WHEN v.status = 'ausgecheckt' THEN '${VISIT_STATUS.CHECKED_OUT}'
    ELSE v.status
  END
`;

function buildTodayQuery(status?: string, search?: string, signatureStatus?: string) {
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

  if (signatureStatus && signatureStatus !== "all") {
    predicates.push(`ISNULL(v.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = @signatureStatus`);
  }

  return predicates.join(" AND ");
}

function createScopeClause(user: AuthenticatedUser): string {
  if (user.role === "admin" || user.role === "guard") {
    return "1 = 1";
  }

  return "1 = 1";
}

function isBlank(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  return !normalized || normalized.toLowerCase() === MISSING_IMPORT_VALUE;
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

function isDateOnlyValue(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

type CompletenessSourceVisit = {
  status: string;
  approvalStatus?: ApprovalStatus | null;
  firstName: string;
  lastName: string;
  company: string;
  hostName: string;
  hostPhone: string | null;
  purpose: string;
  validFrom: string;
  validUntil: string;
  gateId: string | null;
  badgeNumber: string | null;
  checkOutAt: string | null;
  birthDate: string | null;
  visitorPhone: string | null;
  visitorEmail: string | null;
  licensePlate: string | null;
  idDocumentType: string | null;
  idDocumentValidUntil?: string | null;
  idDocumentNumber: string | null;
  idDocumentIssuingPlace?: string | null;
  visitorStreet?: string | null;
  visitorHouseNumber?: string | null;
  visitorPostalCode?: string | null;
  visitorCity?: string | null;
  visitorAddress?: string | null;
};

function getSystemFieldValue(visit: CompletenessSourceVisit, fieldKey: string): string | null {
  const mapping: Record<string, string | null | undefined> = {
    visitor_first_name: visit.firstName,
    visitor_last_name: visit.lastName,
    visitor_company: visit.company,
    visitor_birth_date: visit.birthDate,
    visitor_phone: visit.visitorPhone,
    visitor_email: visit.visitorEmail,
    visitor_license_plate: visit.licensePlate,
    visitor_street: visit.visitorStreet,
    visitor_house_number: visit.visitorHouseNumber,
    visitor_postal_code: visit.visitorPostalCode,
    visitor_city: visit.visitorCity,
    visitor_address: visit.visitorAddress,
    host_name: visit.hostName,
    host_phone: visit.hostPhone,
    visit_purpose: visit.purpose,
    valid_from: visit.validFrom,
    valid_until: visit.validUntil,
    id_document_type: visit.idDocumentType,
    id_document_valid_until: visit.idDocumentValidUntil || null,
    id_document_number: visit.idDocumentNumber
  };
  return mapping[fieldKey] ?? null;
}

function defaultCompletenessConfig(): CompletenessFieldConfig {
  const required = [
    ["visitor_first_name", "Vorname"],
    ["visitor_last_name", "Nachname"],
    ["visitor_company", "Firma / Organisation"],
    ["host_name", "Ansprechpartner"],
    ["host_phone", "Ansprechpartner Telefon"],
    ["visit_purpose", "Besuchszweck"],
    ["valid_from", "Gültig von"],
    ["valid_until", "Gültig bis"],
    ["visitor_street", "Straße"],
    ["visitor_house_number", "Hausnummer"],
    ["visitor_postal_code", "PLZ"],
    ["visitor_city", "Wohnort"],
    ["id_document_type", "Ausweisart"],
    ["id_document_valid_until", "Ausweis gültig bis"],
    ["id_document_number", "Ausweisnummer"]
  ].map(([fieldKey, label], index) => ({
    id: `default-${fieldKey}`,
    fieldKey,
    label,
    fieldType: "text",
    section: "default",
    isSystem: true,
    isActive: true,
    showInPublic: false,
    showInGuard: true,
    showInSibe: true,
    showOnBadge: false,
    requiredPublic: false,
    requiredGuardCheckin: true,
    requiredBeforePrint: true,
    sortOrder: index,
    helpText: null,
    optionsJson: null
  }));

  const optionalInfo = [
    ["visitor_birth_date", "Geburtsdatum ist nicht angegeben."],
    ["visitor_phone", "Besucher-Telefon ist nicht angegeben."],
    ["visitor_email", "Besucher-E-Mail ist nicht angegeben."],
    ["visitor_license_plate", "Kennzeichen ist nicht angegeben."]
  ].map(([fieldKey, helpText], index) => ({
    id: `default-info-${fieldKey}`,
    fieldKey,
    label: fieldKey,
    fieldType: "text",
    section: "default",
    isSystem: true,
    isActive: true,
    showInPublic: false,
    showInGuard: true,
    showInSibe: true,
    showOnBadge: false,
    requiredPublic: false,
    requiredGuardCheckin: false,
    requiredBeforePrint: false,
    sortOrder: index,
    helpText,
    optionsJson: null
  }));

  return {
    requiredGuardCheckin: required,
    requiredBeforePrint: required,
    optionalInfoGuard: optionalInfo
  };
}

export function getVisitCompleteness(visit: CompletenessSourceVisit, config?: CompletenessFieldConfig): VisitCompleteness {
  const errors: VisitCompletenessIssue[] = [];
  const warnings: VisitCompletenessIssue[] = [];
  const infos: VisitCompletenessIssue[] = [];
  const completenessConfig = config ?? defaultCompletenessConfig();
  const missingRequiredFields = new Set<string>();
  const missingGuard = new Set<string>();
  const missingPrint = new Set<string>();

  const hasAddressFreeText = !isBlank(visit.visitorAddress);
  const hasStreet = !isBlank(visit.visitorStreet);
  const hasHouseNumber = !isBlank(visit.visitorHouseNumber);
  const hasPostalCode = !isBlank(visit.visitorPostalCode);
  const hasCity = !isBlank(visit.visitorCity);

  const checkRequired = (fieldKey: string, label: string, target: Set<string>) => {
    if (fieldKey === "visitor_street" || fieldKey === "visitor_house_number" || fieldKey === "visitor_postal_code" || fieldKey === "visitor_city") {
      if (hasAddressFreeText) {
        return;
      }
    }

    if (fieldKey === "visitor_address") {
      const structuredComplete = hasStreet && hasHouseNumber && hasPostalCode && hasCity;
      if (!hasAddressFreeText && !structuredComplete) {
        target.add(label);
        missingRequiredFields.add(label);
      }
      return;
    }

    if (isBlank(getSystemFieldValue(visit, fieldKey))) {
      target.add(label);
      missingRequiredFields.add(label);
    }
  };

  for (const field of completenessConfig.requiredGuardCheckin) {
    checkRequired(field.fieldKey, field.label, missingGuard);
  }
  for (const field of completenessConfig.requiredBeforePrint) {
    checkRequired(field.fieldKey, field.label, missingPrint);
  }

  for (const field of missingRequiredFields) {
    errors.push({ field, message: `${field} fehlt.`, severity: "error" });
  }

  if ((visit.approvalStatus || APPROVAL_STATUS.NOT_REQUIRED) === APPROVAL_STATUS.PENDING) {
    errors.push({
      field: "approval_status",
      message: "SiBe-Genehmigung steht noch aus.",
      severity: "error"
    });
  }

  if (visit.approvalStatus === APPROVAL_STATUS.REJECTED) {
    errors.push({
      field: "approval_status",
      message: "Besuch wurde durch SiBe abgelehnt.",
      severity: "error"
    });
  }

  const validFromDate = new Date(visit.validFrom);
  const validUntilDate = isDateOnlyValue(visit.validUntil)
    ? normalizeDateOnlyEnd(visit.validUntil)
    : new Date(visit.validUntil);
  if (!Number.isNaN(validFromDate.getTime()) && !Number.isNaN(validUntilDate.getTime()) && validUntilDate <= validFromDate) {
    errors.push({ field: "valid_until", message: "Gültig bis liegt vor oder auf Gültig von.", severity: "error" });
  }

  const now = new Date();
  const validUntilEndOfDayUtc = new Date(validUntilDate);
  if (!Number.isNaN(validUntilEndOfDayUtc.getTime())) {
    validUntilEndOfDayUtc.setUTCHours(23, 59, 59, 999);
  }
  if (!Number.isNaN(validUntilEndOfDayUtc.getTime())
    && validUntilEndOfDayUtc < now
    && (visit.status === VISIT_STATUS.PRE_REGISTERED || visit.status === VISIT_STATUS.CHECKED_IN)
  ) {
    warnings.push({ field: "valid_until", message: "Besuch ist überfällig.", severity: "warning" });
  }

  if (!isBlank(visit.idDocumentValidUntil)) {
    const documentValidUntil = new Date(`${visit.idDocumentValidUntil}T23:59:59.999Z`);
    if (!Number.isNaN(documentValidUntil.getTime()) && documentValidUntil < now) {
      warnings.push({
        field: "id_document_valid_until",
        message: "Ausweisdokument ist abgelaufen.",
        severity: "warning"
      });
    }
  }

  if (isBlank(visit.badgeNumber)) {
    warnings.push({ field: "badge_number", message: "Besuchsnummer fehlt.", severity: "warning" });
  }

  for (const field of completenessConfig.optionalInfoGuard) {
    if (isBlank(getSystemFieldValue(visit, field.fieldKey))) {
      infos.push({
        field: field.fieldKey,
        message: field.helpText?.trim() || `${field.label} ist nicht angegeben.`,
        severity: "info"
      });
    }
  }

  return {
    canCheckIn: visit.status === VISIT_STATUS.PRE_REGISTERED && missingGuard.size === 0 && errors.length === 0,
    canPrintBadge: (visit.status === VISIT_STATUS.PRE_REGISTERED || visit.status === VISIT_STATUS.CHECKED_IN || visit.status === VISIT_STATUS.CHECKED_OUT) && missingPrint.size === 0 && errors.length === 0,
    canCheckOut: visit.status === VISIT_STATUS.CHECKED_IN,
    missingRequiredFields: Array.from(missingRequiredFields),
    errors,
    warnings,
    infos
  };
}

async function getConfiguredVisitCompleteness(visit: CompletenessSourceVisit): Promise<VisitCompleteness> {
  const config = await loadCompletenessFieldConfig();
  return getVisitCompleteness(visit, config ?? undefined);
}

export async function getTodayVisitsForUser(
  user: AuthenticatedUser,
  options: { search?: string; status?: string; signatureStatus?: string }
): Promise<GuardVisitListItem[]> {
  const pool = await getPool();
  const request = pool.request();
  const search = options.search?.trim();

  if (user.role !== "admin" && user.role !== "guard") {
    request.input("gateId", sql.UniqueIdentifier, user.gateId);
  }

  if (options.status && options.status !== "all") {
    request.input("status", sql.NVarChar(32), options.status);
  }

  if (search) {
    request.input("search", sql.NVarChar(255), `%${search}%`);
  }

  if (options.signatureStatus && options.signatureStatus !== "all") {
    request.input("signatureStatus", sql.NVarChar(40), options.signatureStatus);
  }

  const whereClause = `${createScopeClause(user)} AND ${buildTodayQuery(options.status, search, options.signatureStatus)}`;

  const result = await request.query<GuardVisitListItem>(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      ISNULL(v.approval_status, '${APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
      v.approval_note AS approvalNote,
      approver.username AS approvalDecidedBy,
      CONVERT(NVARCHAR(30), v.approval_decided_at, 127) AS approvalDecidedAt,
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
      ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      ISNULL(v.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
      CONVERT(NVARCHAR(10), v.host_signature_date, 23) AS hostSignatureDate,
      v.host_signature_note AS hostSignatureNote,
      confirmer.username AS hostSignatureConfirmedBy,
      CONVERT(NVARCHAR(30), v.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
      v.checkout_note AS checkoutNote,
      v.badge_number AS badgeNumber,
      vis.visitor_street AS visitorStreet,
      vis.visitor_house_number AS visitorHouseNumber,
      vis.visitor_postal_code AS visitorPostalCode,
      vis.visitor_city AS visitorCity,
      vis.visitor_address AS visitorAddress,
      vis.id_document_type AS idDocumentType,
      CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
      vis.id_document_number AS idDocumentNumber,
      vis.id_document_issuing_place AS idDocumentIssuingPlace,
      v.visit_purpose_type AS visitPurposeType,
      v.visit_company_order AS visitCompanyOrder,
      v.host_unit AS hostUnit,
      v.host_building AS hostBuilding,
      v.host_room AS hostRoom,
      v.host_extension AS hostExtension,
      v.visit_end_type AS visitEndType,
      v.forwarded_to_note AS forwardedToNote,
      v.device_photo_app AS devicePhotoApp,
      v.device_film_app AS deviceFilmApp,
      v.device_video_camera AS deviceVideoCamera,
      v.device_manufacturer AS deviceManufacturer,
      v.device_serial_number AS deviceSerialNumber,
      v.device_accessories AS deviceAccessories,
      v.device_deposit_note AS deviceDepositNote,
      v.device_return_confirmed AS deviceReturnConfirmed,
      CONVERT(NVARCHAR(30), v.device_returned_at, 127) AS deviceReturnedAt,
      returner.username AS deviceReturnedBy,
      checkinUser.username AS checkInBy,
      checkoutUser.username AS checkOutBy
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    LEFT JOIN dbo.gates g ON g.id = v.gate_id
    LEFT JOIN dbo.users approver ON approver.id = v.approval_decided_by
    LEFT JOIN dbo.users confirmer ON confirmer.id = v.host_signature_confirmed_by
    LEFT JOIN dbo.users returner ON returner.id = v.device_returned_by
    LEFT JOIN dbo.users checkinUser ON checkinUser.id = v.check_in_by
    LEFT JOIN dbo.users checkoutUser ON checkoutUser.id = v.check_out_by
    WHERE ${whereClause}
    ORDER BY
      CASE
        WHEN ${normalizedStatusSql} = '${VISIT_STATUS.CHECKED_IN}' THEN 0
        WHEN ${normalizedStatusSql} = '${VISIT_STATUS.PRE_REGISTERED}' THEN 1
        ELSE 2
      END,
      v.valid_from ASC,
      vis.last_name ASC,
      vis.first_name ASC
  `);

  return result.recordset;
}

export async function getCalendarVisitsForUser(
  user: AuthenticatedUser,
  options: { from: string; to: string; status?: string; search?: string }
): Promise<GuardCalendarVisitItem[]> {
  const pool = await getPool();
  const request = pool.request();
  const conditions = [createScopeClause(user)];

  if (user.role !== "admin" && user.role !== "guard") {
    request.input("gateId", sql.UniqueIdentifier, user.gateId);
  }

  request.input("fromDate", sql.DateTime2, new Date(options.from));
  request.input("toDateExclusive", sql.DateTime2, new Date(options.to));
  conditions.push("v.valid_from < @toDateExclusive");
  conditions.push("v.valid_until >= @fromDate");

  if (options.status && options.status !== "all") {
    if (options.status === "overdue") {
      conditions.push(`
        ${normalizedStatusSql} IN ('${VISIT_STATUS.PRE_REGISTERED}', '${VISIT_STATUS.CHECKED_IN}')
        AND v.valid_until < SYSUTCDATETIME()
      `);
    } else {
      request.input("status", sql.NVarChar(32), options.status);
      conditions.push(`${normalizedStatusSql} = @status`);
    }
  }

  const search = options.search?.trim();
  if (search) {
    request.input("search", sql.NVarChar(255), `%${search}%`);
    conditions.push(`(
      vis.first_name LIKE @search
      OR vis.last_name LIKE @search
      OR vis.company LIKE @search
      OR v.host_name LIKE @search
      OR ISNULL(v.license_plate, '') LIKE @search
      OR ISNULL(v.badge_number, '') LIKE @search
    )`);
  }

  const result = await request.query<GuardCalendarVisitItem>(`
    SELECT
      v.id,
      v.badge_number AS badgeNumber,
      ${normalizedStatusSql} AS status,
      CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
      vis.company,
      v.host_name AS hostName,
      v.host_department AS hostDepartment,
      v.purpose,
      ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
      CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
      CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
      CASE WHEN v.gate_id IS NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isUnassigned,
      v.license_plate AS licensePlate
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    LEFT JOIN dbo.gates g ON g.id = v.gate_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY v.valid_from ASC, vis.last_name ASC, vis.first_name ASC
  `);

  return result.recordset;
}

export async function getVisitDetailForUser(user: AuthenticatedUser, visitId: string): Promise<VisitDetail | null> {
  const pool = await getPool();
  const request = pool.request().input("visitId", sql.UniqueIdentifier, visitId);

  if (user.role !== "admin") {
    request.input("gateId", sql.UniqueIdentifier, user.gateId);
  }

  const scopeClause = user.role === "admin" || user.role === "guard"
    ? "1 = 1"
    : `(v.gate_id = @gateId OR (v.gate_id IS NULL AND ${normalizedStatusSql} = '${VISIT_STATUS.PRE_REGISTERED}'))`;
  const visitResult = await request.query<VisitDetail>(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      ISNULL(v.approval_status, '${APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
      v.approval_note AS approvalNote,
      approver.username AS approvalDecidedBy,
      CONVERT(NVARCHAR(30), v.approval_decided_at, 127) AS approvalDecidedAt,
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
      ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      ISNULL(v.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
      CONVERT(NVARCHAR(10), v.host_signature_date, 23) AS hostSignatureDate,
      v.host_signature_note AS hostSignatureNote,
      confirmer.username AS hostSignatureConfirmedBy,
      CONVERT(NVARCHAR(30), v.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
      v.checkout_note AS checkoutNote,
      v.notes,
      v.badge_number AS badgeNumber,
      vis.visitor_street AS visitorStreet,
      vis.visitor_house_number AS visitorHouseNumber,
      vis.visitor_postal_code AS visitorPostalCode,
      vis.visitor_city AS visitorCity,
      vis.visitor_address AS visitorAddress,
      vis.id_document_type AS idDocumentType,
      CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
      vis.id_document_number AS idDocumentNumber,
      vis.id_document_issuing_place AS idDocumentIssuingPlace,
      v.visit_purpose_type AS visitPurposeType,
      v.visit_company_order AS visitCompanyOrder,
      v.host_unit AS hostUnit,
      v.host_building AS hostBuilding,
      v.host_room AS hostRoom,
      v.host_extension AS hostExtension,
      v.visit_end_type AS visitEndType,
      v.forwarded_to_note AS forwardedToNote,
      v.device_photo_app AS devicePhotoApp,
      v.device_film_app AS deviceFilmApp,
      v.device_video_camera AS deviceVideoCamera,
      v.device_manufacturer AS deviceManufacturer,
      v.device_serial_number AS deviceSerialNumber,
      v.device_accessories AS deviceAccessories,
      v.device_deposit_note AS deviceDepositNote,
      v.device_return_confirmed AS deviceReturnConfirmed,
      CONVERT(NVARCHAR(30), v.device_returned_at, 127) AS deviceReturnedAt,
      returner.username AS deviceReturnedBy,
      checkinUser.username AS checkInBy,
      checkoutUser.username AS checkOutBy,
      CAST(NULL AS NVARCHAR(1)) AS siteMap,
      CAST(NULL AS NVARCHAR(1)) AS badgeTexts
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    LEFT JOIN dbo.gates g ON g.id = v.gate_id
    LEFT JOIN dbo.users approver ON approver.id = v.approval_decided_by
    LEFT JOIN dbo.users confirmer ON confirmer.id = v.host_signature_confirmed_by
    LEFT JOIN dbo.users returner ON returner.id = v.device_returned_by
    LEFT JOIN dbo.users checkinUser ON checkinUser.id = v.check_in_by
    LEFT JOIN dbo.users checkoutUser ON checkoutUser.id = v.check_out_by
    WHERE v.id = @visitId AND ${scopeClause}
  `);

  const visit = visitResult.recordset[0];

  if (!visit) {
    return null;
  }

  const siteMapResult = await pool.request().query<{ id: string; name: string; filePath: string }>(`
    SELECT TOP 1
      id,
      name,
      file_path AS filePath
    FROM dbo.site_maps
    WHERE is_active = 1
    ORDER BY created_at DESC
  `);

  const badgeTextsResult = await pool.request().query<{ id: string; name: string; textType: string; content: string }>(`
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
    badgeTexts: badgeTextsResult.recordset,
    completeness: await getConfiguredVisitCompleteness(visit)
  };
}

async function loadVisitForUpdate(transaction: sql.Transaction, visitId: string): Promise<VisitScopeRow | null> {
  const result = await new sql.Request(transaction)
    .input("visitId", sql.UniqueIdentifier, visitId)
    .query<VisitScopeRow>(`
      SELECT
        id,
        gate_id AS gateId,
        badge_number AS badgeNumber,
        approval_status AS approvalStatus,
        visitor_id AS visitorId,
        valid_from AS validFrom,
        host_signature_status AS hostSignatureStatus,
        host_signature_date AS hostSignatureDate,
        host_signature_note AS hostSignatureNote,
        host_signature_confirmed_by AS hostSignatureConfirmedBy,
        host_signature_confirmed_at AS hostSignatureConfirmedAt,
        status
      FROM dbo.visits WITH (UPDLOCK, ROWLOCK)
      WHERE id = @visitId
    `);

  return result.recordset[0] ?? null;
}

export async function checkInVisit(
  user: AuthenticatedUser,
  visitId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (visit.gateId && !canAccessGate(user, visit.gateId)) {
      throw new Error("visit_scope_forbidden");
    }

    if (!visit.gateId && user.role === "admin" && !user.gateId) {
      throw new Error("visit_gate_required_for_checkin");
    }

    const preCheckResult = await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .query<{
        status: string;
        firstName: string;
        lastName: string;
        company: string;
        hostName: string;
        hostPhone: string | null;
        purpose: string;
        validFrom: string;
        validUntil: string;
        gateId: string | null;
        badgeNumber: string | null;
        checkOutAt: string | null;
        birthDate: string | null;
        visitorPhone: string | null;
        visitorEmail: string | null;
        licensePlate: string | null;
        idDocumentType: string | null;
        idDocumentValidUntil: string | null;
        idDocumentNumber: string | null;
        idDocumentIssuingPlace: string | null;
        visitorStreet: string | null;
        visitorHouseNumber: string | null;
        visitorPostalCode: string | null;
        visitorCity: string | null;
        visitorAddress: string | null;
      }>(`
      SELECT
        ${normalizedStatusSql} AS status,
        ISNULL(v.approval_status, '${APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
        vis.first_name AS firstName,
          vis.last_name AS lastName,
          vis.company,
          v.host_name AS hostName,
          v.host_phone AS hostPhone,
          v.purpose,
          CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
          CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
          v.gate_id AS gateId,
          v.badge_number AS badgeNumber,
          CONVERT(NVARCHAR(30), v.check_out_at, 127) AS checkOutAt,
          CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
          vis.phone_optional AS visitorPhone,
          vis.email_optional AS visitorEmail,
          v.license_plate AS licensePlate,
          vis.id_document_type AS idDocumentType,
          CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
          vis.id_document_number AS idDocumentNumber,
          vis.id_document_issuing_place AS idDocumentIssuingPlace,
          vis.visitor_street AS visitorStreet,
          vis.visitor_house_number AS visitorHouseNumber,
          vis.visitor_postal_code AS visitorPostalCode,
          vis.visitor_city AS visitorCity,
          vis.visitor_address AS visitorAddress
        FROM dbo.visits v
        INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
        WHERE v.id = @visitId
      `);
    const preCheckVisit = preCheckResult.recordset[0];

    if (!preCheckVisit) {
      throw new Error("visit_not_found");
    }

    const completeness = await getConfiguredVisitCompleteness(preCheckVisit);
    if (!completeness.canCheckIn) {
      const validationError = new Error("visit_required_fields_missing");
      (validationError as Error & { details?: unknown }).details = completeness.errors;
      throw validationError;
    }

    assertCanCheckIn(visit.status);
    assertVisitApprovedForCheckIn(visit.approvalStatus);

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .input("checkInBy", sql.UniqueIdentifier, user.id)
      .input("gateId", sql.UniqueIdentifier, user.gateId)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CHECKED_IN}',
          gate_id = COALESCE(gate_id, @gateId),
          check_in_at = SYSUTCDATETIME(),
          check_in_by = @checkInBy,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);

    await writeAuditLog(
      {
        user: user.username,
        userId: user.id,
        action: "VISIT_CHECKED_IN",
        objectType: "visit",
        objectId: visitId,
        ipAddress,
        userAgent
      },
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function checkOutVisit(
  user: AuthenticatedUser,
  visitId: string,
  returnedBadgeNumber: string,
  signature: {
    status: HostSignatureStatus;
    signatureDate?: string | null;
    note?: string | null;
  },
  checkoutNote?: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (!visit.gateId || !canAccessGate(user, visit.gateId)) {
      throw new Error("visit_scope_forbidden");
    }

    assertCanCheckOut(visit.status, signature);

    const normalizedReturnedBadgeNumber = returnedBadgeNumber.trim();
    const expectedBadgeNumber = (visit.badgeNumber?.trim() || visit.id.slice(0, 8).toUpperCase());
    assertReturnedBadgeNumberMatches(expectedBadgeNumber, normalizedReturnedBadgeNumber);

    const normalizedSignatureDate = signature.signatureDate?.trim() ? signature.signatureDate.trim() : null;
    const normalizedSignatureNote = signature.note?.trim() ? signature.note.trim() : null;

    if (signature.status === HOST_SIGNATURE_STATUS.SIGNED_LATER && normalizedSignatureDate) {
      const signatureDate = new Date(normalizedSignatureDate);
      const visitStart = visit.validFrom ? new Date(visit.validFrom) : null;
      if (Number.isNaN(signatureDate.getTime())) {
        throw new Error("host_signature_date_required");
      }
      if (visitStart && signatureDate < new Date(visitStart.toISOString().slice(0, 10))) {
        throw new Error("host_signature_date_before_visit");
      }
    }

    const existingSignatureDate = visit.hostSignatureDate
      ? new Date(visit.hostSignatureDate).toISOString().slice(0, 10)
      : null;
    const existingSignatureNote = visit.hostSignatureNote?.trim() || null;
    const existingSignatureStatus = visit.hostSignatureStatus || HOST_SIGNATURE_STATUS.PENDING;
    const shouldPreserveExistingConfirmation = (
      existingSignatureStatus === signature.status
      && existingSignatureDate === normalizedSignatureDate
      && existingSignatureNote === normalizedSignatureNote
      && Boolean(visit.hostSignatureConfirmedBy)
      && Boolean(visit.hostSignatureConfirmedAt)
    );

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .input("checkoutNote", sql.NVarChar(sql.MAX), checkoutNote?.trim() || null)
      .input("signatureStatus", sql.NVarChar(40), signature.status)
      .input("signatureDate", sql.Date, normalizedSignatureDate)
      .input("signatureNote", sql.NVarChar(500), normalizedSignatureNote)
      .input("returnedBadgeNumber", sql.NVarChar(64), normalizedReturnedBadgeNumber)
      .input("confirmedBy", sql.UniqueIdentifier, shouldPreserveExistingConfirmation ? visit.hostSignatureConfirmedBy ?? null : user.id)
      .input("preserveConfirmedAt", sql.Bit, shouldPreserveExistingConfirmation)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CHECKED_OUT}',
          check_out_at = SYSUTCDATETIME(),
          signed_by_host_confirmed = CASE WHEN @signatureStatus = 'signed_same_day' THEN 1 ELSE 0 END,
          host_signature_status = @signatureStatus,
          host_signature_date = @signatureDate,
          host_signature_note = @signatureNote,
          host_signature_confirmed_by = @confirmedBy,
          host_signature_confirmed_at = CASE WHEN @preserveConfirmedAt = 1 THEN host_signature_confirmed_at ELSE SYSUTCDATETIME() END,
          returned_badge_number = @returnedBadgeNumber,
          returned_badge_number_checked_at = SYSUTCDATETIME(),
          returned_badge_number_checked_by = @confirmedBy,
          check_out_by = @confirmedBy,
          checkout_note = @checkoutNote,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);

    await writeAuditLog(
      {
        user: user.username,
        userId: user.id,
        action: "VISIT_CHECKED_OUT",
        objectType: "visit",
        objectId: visitId,
        ipAddress,
        userAgent,
        metadata: {
          checkout_note_present: Boolean(checkoutNote?.trim()),
          signature_status: signature.status,
          preserved_signature_confirmation: shouldPreserveExistingConfirmation,
          returned_badge_number_checked: true
        }
      },
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateHostSignatureForGuard(
  user: AuthenticatedUser,
  visitId: string,
  signature: {
    status: HostSignatureStatus;
    signatureDate?: string | null;
    note?: string | null;
  },
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (!visit.gateId || !canAccessGate(user, visit.gateId)) {
      throw new Error("visit_scope_forbidden");
    }

    assertCanUpdateHostSignature(visit.status, signature);

    const normalizedSignatureDate = signature.signatureDate?.trim() ? signature.signatureDate.trim() : null;
    const normalizedSignatureNote = signature.note?.trim() ? signature.note.trim() : null;

    if (signature.status === HOST_SIGNATURE_STATUS.SIGNED_LATER && normalizedSignatureDate) {
      const signatureDate = new Date(normalizedSignatureDate);
      const visitStart = visit.validFrom ? new Date(visit.validFrom) : null;
      if (Number.isNaN(signatureDate.getTime())) {
        throw new Error("host_signature_date_required");
      }
      if (visitStart && signatureDate < new Date(visitStart.toISOString().slice(0, 10))) {
        throw new Error("host_signature_date_before_visit");
      }
    }

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .input("signatureStatus", sql.NVarChar(40), signature.status)
      .input("signatureDate", sql.Date, normalizedSignatureDate)
      .input("signatureNote", sql.NVarChar(500), normalizedSignatureNote)
      .input("confirmedBy", sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE dbo.visits
        SET
          signed_by_host_confirmed = CASE WHEN @signatureStatus = 'signed_same_day' THEN 1 ELSE 0 END,
          host_signature_status = @signatureStatus,
          host_signature_date = @signatureDate,
          host_signature_note = @signatureNote,
          host_signature_confirmed_by = @confirmedBy,
          host_signature_confirmed_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);

    await writeAuditLog(
      {
        user: user.username,
        userId: user.id,
        action: "VISIT_SIGNATURE_UPDATED",
        objectType: "visit",
        objectId: visitId,
        ipAddress,
        userAgent,
        metadata: {
          signature_status: signature.status,
          changed_fields: ["host_signature_status", "host_signature_date", "host_signature_note"]
        }
      },
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateVisitForGuard(
  user: AuthenticatedUser,
  visitId: string,
  input: {
    firstName: string;
    lastName: string;
    birthDate?: string | null;
    company: string;
    phone?: string | null;
    email?: string | null;
    licensePlate?: string | null;
    hostName: string;
    hostEmail?: string | null;
    hostPhone?: string | null;
    hostDepartment?: string | null;
    purpose: string;
    gateId?: string | null;
    validFrom: string;
    validUntil: string;
    notes?: string | null;
    visitorStreet?: string | null;
    visitorHouseNumber?: string | null;
    visitorPostalCode?: string | null;
    visitorCity?: string | null;
    visitorAddress?: string | null;
    idDocumentType?: string | null;
    idDocumentValidUntil?: string | null;
    idDocumentNumber?: string | null;
    idDocumentIssuingPlace?: string | null;
    visitPurposeType?: string | null;
    visitCompanyOrder?: string | null;
    hostUnit?: string | null;
    hostBuilding?: string | null;
    hostRoom?: string | null;
    hostExtension?: string | null;
    visitEndType?: string | null;
    forwardedToNote?: string | null;
    devicePhotoApp?: boolean | null;
    deviceFilmApp?: boolean | null;
    deviceVideoCamera?: boolean | null;
    deviceManufacturer?: string | null;
    deviceSerialNumber?: string | null;
    deviceAccessories?: string | null;
    deviceDepositNote?: string | null;
    deviceReturnConfirmed?: boolean | null;
    deviceReturnedAt?: string | null;
  },
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (!canManageGuardScopedVisit(user, visit, { allowUnassignedPreRegistered: true })) {
      throw new Error("visit_scope_forbidden");
    }

    let nextGateId: string | null = visit.gateId ?? null;

    if (typeof input.gateId === "string" && input.gateId.trim().length > 0) {
      if (!canAccessGate(user, input.gateId)) {
        throw new Error("visit_scope_forbidden");
      }
      nextGateId = input.gateId;
    } else if (user.role === "admin") {
      nextGateId = null;
    }

    if (visit.status !== VISIT_STATUS.PRE_REGISTERED && visit.status !== VISIT_STATUS.CHECKED_IN) {
      throw new Error("visit_update_status_forbidden");
    }

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .input("firstName", sql.NVarChar(120), input.firstName.trim())
      .input("lastName", sql.NVarChar(120), input.lastName.trim())
      .input("birthDate", sql.Date, input.birthDate?.trim() || null)
      .input("company", sql.NVarChar(255), input.company.trim())
      .input("phone", sql.NVarChar(80), input.phone?.trim() || null)
      .input("email", sql.NVarChar(255), input.email?.trim() || null)
      .input("licensePlate", sql.NVarChar(40), input.licensePlate?.trim() || null)
      .input("hostName", sql.NVarChar(255), input.hostName.trim())
      .input("hostEmail", sql.NVarChar(255), input.hostEmail?.trim() || null)
      .input("hostPhone", sql.NVarChar(80), input.hostPhone?.trim() || null)
      .input("hostDepartment", sql.NVarChar(255), input.hostDepartment?.trim() || null)
      .input("purpose", sql.NVarChar(500), input.purpose.trim())
      .input("gateId", sql.UniqueIdentifier, nextGateId)
      .input("validFrom", sql.DateTime2, normalizeDateOnlyStart(input.validFrom))
      .input("validUntil", sql.DateTime2, normalizeDateOnlyEnd(input.validUntil))
      .input("notes", sql.NVarChar(sql.MAX), input.notes?.trim() || null)
      .input("visitorStreet", sql.NVarChar(255), input.visitorStreet?.trim() || null)
      .input("visitorHouseNumber", sql.NVarChar(40), input.visitorHouseNumber?.trim() || null)
      .input("visitorPostalCode", sql.NVarChar(20), input.visitorPostalCode?.trim() || null)
      .input("visitorCity", sql.NVarChar(120), input.visitorCity?.trim() || null)
      .input("visitorAddress", sql.NVarChar(500), input.visitorAddress?.trim() || null)
      .input("idDocumentType", sql.NVarChar(40), input.idDocumentType?.trim() || null)
      .input("idDocumentValidUntil", sql.Date, input.idDocumentValidUntil?.trim() || null)
      .input("idDocumentNumber", sql.NVarChar(120), input.idDocumentNumber?.trim() || null)
      .input("idDocumentIssuingPlace", sql.NVarChar(255), input.idDocumentIssuingPlace?.trim() || null)
      .input("visitPurposeType", sql.NVarChar(40), input.visitPurposeType?.trim() || null)
      .input("visitCompanyOrder", sql.NVarChar(500), input.visitCompanyOrder?.trim() || null)
      .input("hostUnit", sql.NVarChar(255), input.hostUnit?.trim() || null)
      .input("hostBuilding", sql.NVarChar(120), input.hostBuilding?.trim() || null)
      .input("hostRoom", sql.NVarChar(80), input.hostRoom?.trim() || null)
      .input("hostExtension", sql.NVarChar(80), input.hostExtension?.trim() || null)
      .input("visitEndType", sql.NVarChar(40), input.visitEndType?.trim() || null)
      .input("forwardedToNote", sql.NVarChar(500), input.forwardedToNote?.trim() || null)
      .input("devicePhotoApp", sql.Bit, input.devicePhotoApp ?? null)
      .input("deviceFilmApp", sql.Bit, input.deviceFilmApp ?? null)
      .input("deviceVideoCamera", sql.Bit, input.deviceVideoCamera ?? null)
      .input("deviceManufacturer", sql.NVarChar(255), input.deviceManufacturer?.trim() || null)
      .input("deviceSerialNumber", sql.NVarChar(120), input.deviceSerialNumber?.trim() || null)
      .input("deviceAccessories", sql.NVarChar(500), input.deviceAccessories?.trim() || null)
      .input("deviceDepositNote", sql.NVarChar(500), input.deviceDepositNote?.trim() || null)
      .input("deviceReturnConfirmed", sql.Bit, input.deviceReturnConfirmed ?? null)
      .input("deviceReturnedAt", sql.DateTime2, input.deviceReturnedAt?.trim() ? new Date(input.deviceReturnedAt) : null)
      .input("deviceReturnedBy", sql.UniqueIdentifier, input.deviceReturnConfirmed ? user.id : null)
      .query(`
        UPDATE dbo.visitors
        SET
          first_name = @firstName,
          last_name = @lastName,
          birth_date = @birthDate,
          company = @company,
          phone_optional = @phone,
          email_optional = @email,
          visitor_street = @visitorStreet,
          visitor_house_number = @visitorHouseNumber,
          visitor_postal_code = @visitorPostalCode,
          visitor_city = @visitorCity,
          visitor_address = @visitorAddress,
          id_document_type = @idDocumentType,
          id_document_valid_until = @idDocumentValidUntil,
          id_document_number = @idDocumentNumber,
          id_document_issuing_place = @idDocumentIssuingPlace,
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
          visit_purpose_type = @visitPurposeType,
          visit_company_order = @visitCompanyOrder,
          host_unit = @hostUnit,
          host_building = @hostBuilding,
          host_room = @hostRoom,
          host_extension = @hostExtension,
          visit_end_type = @visitEndType,
          forwarded_to_note = @forwardedToNote,
          device_photo_app = @devicePhotoApp,
          device_film_app = @deviceFilmApp,
          device_video_camera = @deviceVideoCamera,
          device_manufacturer = @deviceManufacturer,
          device_serial_number = @deviceSerialNumber,
          device_accessories = @deviceAccessories,
          device_deposit_note = @deviceDepositNote,
          device_return_confirmed = @deviceReturnConfirmed,
          device_returned_at = @deviceReturnedAt,
          device_returned_by = @deviceReturnedBy,
          notes = @notes,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId;
      `);

    await writeAuditLog({
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
          "visitor_street",
          "visitor_house_number",
          "visitor_postal_code",
          "visitor_city",
          "visitor_address",
          "id_document_type",
          "id_document_valid_until",
          "id_document_number(masked)",
          "id_document_issuing_place",
          "license_plate",
          "host_name",
          "host_email",
          "host_phone",
          "host_department",
          "purpose",
          "visit_purpose_type",
          "visit_company_order",
          "host_unit",
          "host_building",
          "host_room",
          "host_extension",
          "visit_end_type",
          "forwarded_to_note",
          "device_photo_app",
          "device_film_app",
          "device_video_camera",
          "device_manufacturer",
          "device_serial_number",
          "device_accessories",
          "device_deposit_note",
          "device_return_confirmed",
          "device_returned_at",
          "device_returned_by",
          "gate_id",
          "valid_from",
          "valid_until",
          "notes"
        ]
      }
    }, transaction);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "VISITOR_UPDATED_BY_GUARD",
      objectType: "visitor",
      objectId: visit.visitorId ?? "unknown",
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
          "visitor_street",
          "visitor_house_number",
          "visitor_postal_code",
          "visitor_city",
          "visitor_address",
          "id_document_type",
          "id_document_valid_until",
          "id_document_number(masked)",
          "id_document_issuing_place"
        ]
      }
    }, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARD_VISITOR_SEARCH_MIN_LENGTH = void 0;
exports.canUseGuardVisitorSearch = canUseGuardVisitorSearch;
exports.hasGuardVisitorSearchCriteria = hasGuardVisitorSearchCriteria;
exports.getVisitCompleteness = getVisitCompleteness;
exports.getTodayVisitsForUser = getTodayVisitsForUser;
exports.getCalendarVisitsForUser = getCalendarVisitsForUser;
exports.getVisitDetailForUser = getVisitDetailForUser;
exports.searchVisitorsForGuard = searchVisitorsForGuard;
exports.checkInVisit = checkInVisit;
exports.createWalkInVisit = createWalkInVisit;
exports.checkOutVisit = checkOutVisit;
exports.updateHostSignatureForGuard = updateHostSignatureForGuard;
exports.updateVisitForGuard = updateVisitForGuard;
const mssql_1 = __importDefault(require("mssql"));
const db_1 = require("./db");
const auditLog_1 = require("./auditLog");
const badgeNumber_1 = require("./badgeNumber");
const fieldDefinitions_1 = require("./fieldDefinitions");
const visitWorkflow_1 = require("./visitWorkflow");
const MISSING_IMPORT_VALUE = "[fehlt]";
exports.GUARD_VISITOR_SEARCH_MIN_LENGTH = 2;
const normalizedStatusSql = `
  CASE
    WHEN v.status = 'vorangemeldet' THEN '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}'
    WHEN v.status = 'eingecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}'
    WHEN v.status = 'ausgecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}'
    ELSE v.status
  END
`;
function normalizedStatusForAlias(alias) {
    return `
    CASE
      WHEN ${alias}.status = 'vorangemeldet' THEN '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}'
      WHEN ${alias}.status = 'eingecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}'
      WHEN ${alias}.status = 'ausgecheckt' THEN '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}'
      ELSE ${alias}.status
    END
  `;
}
function buildTodayQuery(status, search, signatureStatus) {
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
        predicates.push(`ISNULL(v.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') = @signatureStatus`);
    }
    return predicates.join(" AND ");
}
function createScopeClause(user) {
    if (user.role === "admin" || user.role === "guard") {
        return "1 = 1";
    }
    return "1 = 1";
}
function isBlank(value) {
    const normalized = value?.trim();
    return !normalized || normalized.toLowerCase() === MISSING_IMPORT_VALUE;
}
function cleanOptional(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}
function sanitizeSearchText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function canUseGuardVisitorSearch(user) {
    return (user.role === "guard" || user.role === "admin")
        && Boolean(user.permissions?.visits?.create);
}
function hasGuardVisitorSearchCriteria(input) {
    const textFields = [
        input.query,
        input.firstName,
        input.lastName,
        input.company,
        input.city,
        input.phone,
        input.email,
        input.licensePlate,
        input.badgeNumber
    ].map(sanitizeSearchText);
    if (textFields.some((value) => value.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH)) {
        return true;
    }
    return sanitizeSearchText(input.birthDate).length === 10;
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
function isDateOnlyValue(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}
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
function getSystemFieldValue(visit, fieldKey) {
    const mapping = {
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
function defaultCompletenessConfig() {
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
function getVisitCompleteness(visit, config) {
    const errors = [];
    const warnings = [];
    const infos = [];
    const completenessConfig = config ?? defaultCompletenessConfig();
    const missingRequiredFields = new Set();
    const missingGuard = new Set();
    const missingPrint = new Set();
    const hasAddressFreeText = !isBlank(visit.visitorAddress);
    const hasStreet = !isBlank(visit.visitorStreet);
    const hasHouseNumber = !isBlank(visit.visitorHouseNumber);
    const hasPostalCode = !isBlank(visit.visitorPostalCode);
    const hasCity = !isBlank(visit.visitorCity);
    const checkRequired = (fieldKey, label, target) => {
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
    if ((visit.approvalStatus || visitWorkflow_1.APPROVAL_STATUS.NOT_REQUIRED) === visitWorkflow_1.APPROVAL_STATUS.PENDING) {
        errors.push({
            field: "approval_status",
            message: "SiBe-Genehmigung steht noch aus.",
            severity: "error"
        });
    }
    if (visit.approvalStatus === visitWorkflow_1.APPROVAL_STATUS.REJECTED) {
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
        && (visit.status === visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED || visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_IN)) {
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
        canCheckIn: visit.status === visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED && missingGuard.size === 0 && errors.length === 0,
        canPrintBadge: (visit.status === visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED || visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_IN || visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_OUT) && missingPrint.size === 0 && errors.length === 0,
        canCheckOut: visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_IN,
        missingRequiredFields: Array.from(missingRequiredFields),
        errors,
        warnings,
        infos
    };
}
async function getConfiguredVisitCompleteness(visit) {
    const config = await (0, fieldDefinitions_1.loadCompletenessFieldConfig)();
    return getVisitCompleteness(visit, config ?? undefined);
}
async function getTodayVisitsForUser(user, options) {
    const pool = await (0, db_1.getPool)();
    const request = pool.request();
    const search = options.search?.trim();
    if (user.role !== "admin" && user.role !== "guard") {
        request.input("gateId", mssql_1.default.UniqueIdentifier, user.gateId);
    }
    if (options.status && options.status !== "all") {
        request.input("status", mssql_1.default.NVarChar(32), options.status);
    }
    if (search) {
        request.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
    }
    if (options.signatureStatus && options.signatureStatus !== "all") {
        request.input("signatureStatus", mssql_1.default.NVarChar(40), options.signatureStatus);
    }
    const whereClause = `${createScopeClause(user)} AND ${buildTodayQuery(options.status, search, options.signatureStatus)}`;
    const result = await request.query(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      ISNULL(v.approval_status, '${visitWorkflow_1.APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
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
      ISNULL(v.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
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
async function getCalendarVisitsForUser(user, options) {
    const pool = await (0, db_1.getPool)();
    const request = pool.request();
    const conditions = [createScopeClause(user)];
    if (user.role !== "admin" && user.role !== "guard") {
        request.input("gateId", mssql_1.default.UniqueIdentifier, user.gateId);
    }
    request.input("fromDate", mssql_1.default.DateTime2, new Date(options.from));
    request.input("toDateExclusive", mssql_1.default.DateTime2, new Date(options.to));
    conditions.push("v.valid_from < @toDateExclusive");
    conditions.push("v.valid_until >= @fromDate");
    if (options.status && options.status !== "all") {
        if (options.status === "overdue") {
            conditions.push(`
        ${normalizedStatusSql} IN ('${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}', '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}')
        AND v.valid_until < SYSUTCDATETIME()
      `);
        }
        else {
            request.input("status", mssql_1.default.NVarChar(32), options.status);
            conditions.push(`${normalizedStatusSql} = @status`);
        }
    }
    const search = options.search?.trim();
    if (search) {
        request.input("search", mssql_1.default.NVarChar(255), `%${search}%`);
        conditions.push(`(
      vis.first_name LIKE @search
      OR vis.last_name LIKE @search
      OR vis.company LIKE @search
      OR v.host_name LIKE @search
      OR ISNULL(v.license_plate, '') LIKE @search
      OR ISNULL(v.badge_number, '') LIKE @search
    )`);
    }
    const result = await request.query(`
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
async function getVisitDetailForUser(user, visitId) {
    const pool = await (0, db_1.getPool)();
    const request = pool.request().input("visitId", mssql_1.default.UniqueIdentifier, visitId);
    if (user.role !== "admin") {
        request.input("gateId", mssql_1.default.UniqueIdentifier, user.gateId);
    }
    const scopeClause = user.role === "admin" || user.role === "guard"
        ? "1 = 1"
        : `(v.gate_id = @gateId OR (v.gate_id IS NULL AND ${normalizedStatusSql} = '${visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED}'))`;
    const visitResult = await request.query(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      ISNULL(v.approval_status, '${visitWorkflow_1.APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
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
      ISNULL(v.host_signature_status, '${visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
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
      text_type AS sectionType,
      custom_heading AS customHeading,
      content,
      sort_order AS sortOrder
    FROM dbo.badge_text_templates
    WHERE is_active = 1
    ORDER BY sort_order ASC, updated_at ASC, name ASC
  `);
    return {
        ...visit,
        siteMap: siteMapResult.recordset[0] ?? null,
        badgeTexts: badgeTextsResult.recordset,
        completeness: await getConfiguredVisitCompleteness(visit)
    };
}
async function searchVisitorsForGuard(user, input) {
    if (!canUseGuardVisitorSearch(user)) {
        throw new Error("guard_visitor_search_forbidden");
    }
    if (!hasGuardVisitorSearchCriteria(input)) {
        return { visitors: [], page: 1, limit: Math.min(Math.max(input.limit ?? 8, 1), 20) };
    }
    const page = Math.max(input.page ?? 1, 1);
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
    const offset = (page - 1) * limit;
    const request = (await (0, db_1.getPool)()).request()
        .input("offset", mssql_1.default.Int, offset)
        .input("limit", mssql_1.default.Int, limit);
    const conditions = ["ISNULL(vis.is_deleted, 0) = 0"];
    const firstName = sanitizeSearchText(input.firstName);
    const query = sanitizeSearchText(input.query);
    if (query.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("query", mssql_1.default.NVarChar(255), `%${query}%`);
        conditions.push(`(
      vis.first_name LIKE @query
      OR vis.last_name LIKE @query
      OR vis.company LIKE @query
      OR ISNULL(vis.visitor_city, '') LIKE @query
      OR ISNULL(vis.phone_optional, '') LIKE @query
      OR ISNULL(vis.email_optional, '') LIKE @query
      OR EXISTS (
        SELECT 1
        FROM dbo.visits free_visit
        WHERE free_visit.visitor_id = vis.id
          AND (
            UPPER(ISNULL(free_visit.license_plate, '')) LIKE UPPER(@query)
            OR UPPER(ISNULL(free_visit.badge_number, '')) LIKE UPPER(@query)
          )
      )
    )`);
    }
    if (firstName.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("firstName", mssql_1.default.NVarChar(120), `%${firstName}%`);
        conditions.push("vis.first_name LIKE @firstName");
    }
    const lastName = sanitizeSearchText(input.lastName);
    if (lastName.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("lastName", mssql_1.default.NVarChar(120), `%${lastName}%`);
        conditions.push("vis.last_name LIKE @lastName");
    }
    const company = sanitizeSearchText(input.company);
    if (company.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("company", mssql_1.default.NVarChar(255), `%${company}%`);
        conditions.push("vis.company LIKE @company");
    }
    const birthDate = sanitizeSearchText(input.birthDate);
    if (birthDate.length === 10) {
        request.input("birthDate", mssql_1.default.Date, birthDate);
        conditions.push("vis.birth_date = @birthDate");
    }
    const city = sanitizeSearchText(input.city);
    if (city.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("city", mssql_1.default.NVarChar(120), `%${city}%`);
        conditions.push("ISNULL(vis.visitor_city, '') LIKE @city");
    }
    const phone = sanitizeSearchText(input.phone);
    if (phone.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("phone", mssql_1.default.NVarChar(80), `%${phone}%`);
        conditions.push("ISNULL(vis.phone_optional, '') LIKE @phone");
    }
    const email = sanitizeSearchText(input.email);
    if (email.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("email", mssql_1.default.NVarChar(255), `%${email}%`);
        conditions.push("ISNULL(vis.email_optional, '') LIKE @email");
    }
    const licensePlate = sanitizeSearchText(input.licensePlate).toUpperCase();
    if (licensePlate.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("licensePlate", mssql_1.default.NVarChar(40), `%${licensePlate}%`);
        conditions.push(`
      EXISTS (
        SELECT 1
        FROM dbo.visits plate_visit
        WHERE plate_visit.visitor_id = vis.id
          AND UPPER(ISNULL(plate_visit.license_plate, '')) LIKE @licensePlate
      )
    `);
    }
    const badgeNumber = sanitizeSearchText(input.badgeNumber).toUpperCase();
    if (badgeNumber.length >= exports.GUARD_VISITOR_SEARCH_MIN_LENGTH) {
        request.input("badgeNumber", mssql_1.default.NVarChar(64), `%${badgeNumber}%`);
        conditions.push(`
      EXISTS (
        SELECT 1
        FROM dbo.visits badge_visit
        WHERE badge_visit.visitor_id = vis.id
          AND UPPER(ISNULL(badge_visit.badge_number, '')) LIKE @badgeNumber
      )
    `);
    }
    const result = await request.query(`
    WITH matched_visitors AS (
      SELECT
        vis.id AS visitorId,
        vis.first_name AS firstName,
        vis.last_name AS lastName,
        vis.company,
        CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
        vis.phone_optional AS phone,
        vis.email_optional AS email,
        vis.visitor_street AS visitorStreet,
        vis.visitor_house_number AS visitorHouseNumber,
        vis.visitor_postal_code AS visitorPostalCode,
        vis.visitor_city AS visitorCity,
        vis.id_document_type AS idDocumentType,
        CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
        vis.id_document_number AS idDocumentNumber,
        latest_visit.license_plate AS lastLicensePlate,
        COUNT(all_visits.id) AS visitCount,
        CONVERT(NVARCHAR(30), latest_visit.valid_from, 127) AS lastVisitAt,
        ${normalizedStatusForAlias("latest_visit")} AS lastVisitStatus,
        latest_visit.host_name AS lastHostName,
        latest_visit.host_department AS lastHostDepartment,
        latest_visit.purpose AS lastPurpose,
        latest_visit.device_photo_app AS devicePhotoApp,
        latest_visit.device_film_app AS deviceFilmApp,
        latest_visit.device_video_camera AS deviceVideoCamera,
        latest_visit.device_manufacturer AS deviceManufacturer,
        latest_visit.device_serial_number AS deviceSerialNumber,
        latest_visit.device_accessories AS deviceAccessories,
        latest_visit.device_deposit_note AS deviceDepositNote
      FROM dbo.visitors vis
      LEFT JOIN dbo.visits all_visits ON all_visits.visitor_id = vis.id
      OUTER APPLY (
        SELECT TOP 1
          visit.id,
          visit.status,
          visit.valid_from,
          visit.license_plate,
          visit.host_name,
          visit.host_department,
          visit.purpose,
          visit.device_photo_app,
          visit.device_film_app,
          visit.device_video_camera,
          visit.device_manufacturer,
          visit.device_serial_number,
          visit.device_accessories,
          visit.device_deposit_note
        FROM dbo.visits visit
        WHERE visit.visitor_id = vis.id
        ORDER BY COALESCE(visit.check_in_at, visit.valid_from) DESC, visit.created_at DESC
      ) latest_visit
      WHERE ${conditions.join(" AND ")}
      GROUP BY
        vis.id,
        vis.first_name,
        vis.last_name,
        vis.company,
        vis.birth_date,
        vis.phone_optional,
        vis.email_optional,
        vis.visitor_street,
        vis.visitor_house_number,
        vis.visitor_postal_code,
        vis.visitor_city,
        vis.id_document_type,
        vis.id_document_valid_until,
        vis.id_document_number,
        latest_visit.status,
        latest_visit.valid_from,
        latest_visit.license_plate,
        latest_visit.host_name,
        latest_visit.host_department,
        latest_visit.purpose,
        latest_visit.device_photo_app,
        latest_visit.device_film_app,
        latest_visit.device_video_camera,
        latest_visit.device_manufacturer,
        latest_visit.device_serial_number,
        latest_visit.device_accessories,
        latest_visit.device_deposit_note
    ),
    paged_visitors AS (
      SELECT *
      FROM matched_visitors
      ORDER BY lastVisitAt DESC, lastName ASC, firstName ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    ),
    visitor_history AS (
      SELECT
        visit.visitor_id AS visitorId,
        visit.id AS visitId,
        CONVERT(NVARCHAR(30), visit.valid_from, 127) AS validFrom,
        CONVERT(NVARCHAR(30), visit.valid_until, 127) AS validUntil,
        visit.host_name AS hostName,
        visit.host_department AS hostDepartment,
        visit.purpose,
        CONVERT(NVARCHAR(30), visit.check_in_at, 127) AS checkInAt,
        CONVERT(NVARCHAR(30), visit.check_out_at, 127) AS checkOutAt,
        ${normalizedStatusForAlias("visit")} AS status,
        gate.name AS gateName,
        ROW_NUMBER() OVER (PARTITION BY visit.visitor_id ORDER BY COALESCE(visit.check_in_at, visit.valid_from) DESC, visit.created_at DESC) AS rowNumber
      FROM dbo.visits visit
      LEFT JOIN dbo.gates gate ON gate.id = visit.gate_id
      WHERE visit.visitor_id IN (SELECT visitorId FROM paged_visitors)
    )
    SELECT
      visitorId,
      firstName,
      lastName,
      company,
      birthDate,
      phone,
      email,
      visitorStreet,
      visitorHouseNumber,
      visitorPostalCode,
      visitorCity,
      idDocumentType,
      idDocumentValidUntil,
      idDocumentNumber,
      lastLicensePlate,
      visitCount,
      lastVisitAt,
      lastVisitStatus,
      lastHostName,
      lastHostDepartment,
      lastPurpose,
      devicePhotoApp,
      deviceFilmApp,
      deviceVideoCamera,
      deviceManufacturer,
      deviceSerialNumber,
      deviceAccessories,
      deviceDepositNote,
      (
        SELECT
          history.visitId,
          history.validFrom,
          history.validUntil,
          history.hostName,
          history.hostDepartment,
          history.purpose,
          history.checkInAt,
          history.checkOutAt,
          history.status,
          history.gateName
        FROM visitor_history history
        WHERE history.visitorId = paged_visitors.visitorId
          AND history.rowNumber <= 5
        ORDER BY history.validFrom DESC
        FOR JSON PATH
      ) AS historyJson
    FROM paged_visitors
    ORDER BY lastVisitAt DESC, lastName ASC, firstName ASC
  `);
    return {
        page,
        limit,
        visitors: result.recordset.map((row) => ({
            ...row,
            history: row.historyJson ? JSON.parse(row.historyJson) : []
        }))
    };
}
async function loadVisitForUpdate(transaction, visitId) {
    const result = await new mssql_1.default.Request(transaction)
        .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
        .query(`
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
async function checkInVisit(user, visitId, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (visit.gateId && !(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        if (!visit.gateId && user.role === "admin" && !user.gateId) {
            throw new Error("visit_gate_required_for_checkin");
        }
        const preCheckResult = await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .query(`
      SELECT
        ${normalizedStatusSql} AS status,
        ISNULL(v.approval_status, '${visitWorkflow_1.APPROVAL_STATUS.NOT_REQUIRED}') AS approvalStatus,
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
            validationError.details = completeness.errors;
            throw validationError;
        }
        (0, visitWorkflow_1.assertCanCheckIn)(visit.status);
        (0, visitWorkflow_1.assertVisitApprovedForCheckIn)(visit.approvalStatus);
        await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .input("checkInBy", mssql_1.default.UniqueIdentifier, user.id)
            .input("gateId", mssql_1.default.UniqueIdentifier, user.gateId)
            .query(`
        UPDATE dbo.visits
        SET
          status = '${visitWorkflow_1.VISIT_STATUS.CHECKED_IN}',
          gate_id = COALESCE(gate_id, @gateId),
          check_in_at = SYSUTCDATETIME(),
          check_in_by = @checkInBy,
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
async function createWalkInVisit(user, input, ipAddress, userAgent) {
    if (!user.gateId) {
        throw new Error("visit_gate_required_for_checkin");
    }
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const action = input.action === "save" || input.action === "check_in_and_print"
            ? input.action
            : "check_in";
        const clientRequestId = cleanOptional(input.clientRequestId);
        if (clientRequestId) {
            const existingRequest = await new mssql_1.default.Request(transaction)
                .input("clientRequestId", mssql_1.default.NVarChar(64), clientRequestId)
                .query(`
          SELECT TOP 1
            id,
            visitor_id AS visitorId,
            badge_number AS badgeNumber,
            ${normalizedStatusSql} AS status
          FROM dbo.visits
          WHERE client_request_id = @clientRequestId
          ORDER BY created_at DESC
        `);
            const existingVisit = existingRequest.recordset[0];
            if (existingVisit) {
                await transaction.commit();
                return {
                    visitId: existingVisit.id,
                    visitorId: existingVisit.visitorId,
                    badgeNumber: existingVisit.badgeNumber,
                    status: existingVisit.status,
                    alreadyExisted: true
                };
            }
        }
        let visitorId = cleanOptional(input.existingVisitorId);
        let visitorWasReused = false;
        if (visitorId) {
            const visitorExists = await new mssql_1.default.Request(transaction)
                .input("visitorId", mssql_1.default.UniqueIdentifier, visitorId)
                .query(`
          SELECT TOP 1 id
          FROM dbo.visitors
          WHERE id = @visitorId AND ISNULL(is_deleted, 0) = 0
        `);
            if (!visitorExists.recordset[0]) {
                throw new Error("existing_visitor_not_found");
            }
            visitorWasReused = true;
            await new mssql_1.default.Request(transaction)
                .input("visitorId", mssql_1.default.UniqueIdentifier, visitorId)
                .input("firstName", mssql_1.default.NVarChar(120), input.firstName.trim())
                .input("lastName", mssql_1.default.NVarChar(120), input.lastName.trim())
                .input("company", mssql_1.default.NVarChar(255), input.company.trim())
                .input("birthDate", mssql_1.default.Date, cleanOptional(input.birthDate))
                .input("phone", mssql_1.default.NVarChar(80), cleanOptional(input.phone))
                .input("email", mssql_1.default.NVarChar(255), cleanOptional(input.email))
                .input("visitorStreet", mssql_1.default.NVarChar(255), cleanOptional(input.visitorStreet))
                .input("visitorHouseNumber", mssql_1.default.NVarChar(40), cleanOptional(input.visitorHouseNumber))
                .input("visitorPostalCode", mssql_1.default.NVarChar(20), cleanOptional(input.visitorPostalCode))
                .input("visitorCity", mssql_1.default.NVarChar(120), cleanOptional(input.visitorCity))
                .input("idDocumentType", mssql_1.default.NVarChar(40), cleanOptional(input.idDocumentType))
                .input("idDocumentValidUntil", mssql_1.default.Date, cleanOptional(input.idDocumentValidUntil))
                .input("idDocumentNumber", mssql_1.default.NVarChar(120), cleanOptional(input.idDocumentNumber))
                .query(`
          UPDATE dbo.visitors
          SET
            first_name = @firstName,
            last_name = @lastName,
            company = @company,
            birth_date = @birthDate,
            phone_optional = @phone,
            email_optional = @email,
            visitor_street = @visitorStreet,
            visitor_house_number = @visitorHouseNumber,
            visitor_postal_code = @visitorPostalCode,
            visitor_city = @visitorCity,
            id_document_type = @idDocumentType,
            id_document_valid_until = @idDocumentValidUntil,
            id_document_number = @idDocumentNumber,
            updated_at = SYSUTCDATETIME()
          WHERE id = @visitorId
        `);
            await (0, auditLog_1.writeAuditLog)({
                user: user.username,
                userId: user.id,
                action: "guard_existing_visitor_selected",
                objectType: "visitor",
                objectId: visitorId,
                ipAddress,
                userAgent,
                metadata: {
                    gateId: user.gateId
                }
            }, transaction);
        }
        else {
            const visitorInsert = await new mssql_1.default.Request(transaction)
                .input("firstName", mssql_1.default.NVarChar(120), input.firstName.trim())
                .input("lastName", mssql_1.default.NVarChar(120), input.lastName.trim())
                .input("company", mssql_1.default.NVarChar(255), input.company.trim())
                .input("birthDate", mssql_1.default.Date, cleanOptional(input.birthDate))
                .input("phone", mssql_1.default.NVarChar(80), cleanOptional(input.phone))
                .input("email", mssql_1.default.NVarChar(255), cleanOptional(input.email))
                .input("visitorStreet", mssql_1.default.NVarChar(255), input.visitorStreet.trim())
                .input("visitorHouseNumber", mssql_1.default.NVarChar(40), input.visitorHouseNumber.trim())
                .input("visitorPostalCode", mssql_1.default.NVarChar(20), input.visitorPostalCode.trim())
                .input("visitorCity", mssql_1.default.NVarChar(120), input.visitorCity.trim())
                .input("idDocumentType", mssql_1.default.NVarChar(40), input.idDocumentType.trim())
                .input("idDocumentValidUntil", mssql_1.default.Date, input.idDocumentValidUntil.trim())
                .input("idDocumentNumber", mssql_1.default.NVarChar(120), input.idDocumentNumber.trim())
                .query(`
          INSERT INTO dbo.visitors (
            first_name,
            last_name,
            company,
            birth_date,
            phone_optional,
            email_optional,
            visitor_street,
            visitor_house_number,
            visitor_postal_code,
            visitor_city,
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
            @visitorStreet,
            @visitorHouseNumber,
            @visitorPostalCode,
            @visitorCity,
            @idDocumentType,
            @idDocumentValidUntil,
            @idDocumentNumber
          )
        `);
            visitorId = visitorInsert.recordset[0]?.id;
            if (!visitorId) {
                throw new Error("visitor_insert_failed");
            }
            await (0, auditLog_1.writeAuditLog)({
                user: user.username,
                userId: user.id,
                action: "guard_new_visitor_created",
                objectType: "visitor",
                objectId: visitorId,
                ipAddress,
                userAgent,
                metadata: {
                    gateId: user.gateId
                }
            }, transaction);
        }
        const badgeNumber = await generateUniqueBadgeNumber(transaction);
        const visitStatus = action === "save" ? visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED : visitWorkflow_1.VISIT_STATUS.CHECKED_IN;
        const visitInsert = await new mssql_1.default.Request(transaction)
            .input("clientRequestId", mssql_1.default.NVarChar(64), clientRequestId)
            .input("visitorId", mssql_1.default.UniqueIdentifier, visitorId)
            .input("gateId", mssql_1.default.UniqueIdentifier, user.gateId)
            .input("hostName", mssql_1.default.NVarChar(255), input.hostName.trim())
            .input("hostEmail", mssql_1.default.NVarChar(255), cleanOptional(input.hostEmail))
            .input("hostPhone", mssql_1.default.NVarChar(80), input.hostPhone.trim())
            .input("hostDepartment", mssql_1.default.NVarChar(255), cleanOptional(input.hostDepartment))
            .input("purpose", mssql_1.default.NVarChar(500), input.purpose.trim())
            .input("validFrom", mssql_1.default.DateTime2, normalizeDateOnlyStart(input.validFrom))
            .input("validUntil", mssql_1.default.DateTime2, normalizeDateOnlyEnd(input.validUntil))
            .input("licensePlate", mssql_1.default.NVarChar(40), cleanOptional(input.licensePlate))
            .input("badgeNumber", mssql_1.default.NVarChar(64), badgeNumber)
            .input("notes", mssql_1.default.NVarChar(mssql_1.default.MAX), cleanOptional(input.notes))
            .input("checkInBy", mssql_1.default.UniqueIdentifier, user.id)
            .input("devicePhotoApp", mssql_1.default.Bit, input.devicePhotoApp ?? null)
            .input("deviceFilmApp", mssql_1.default.Bit, input.deviceFilmApp ?? null)
            .input("deviceVideoCamera", mssql_1.default.Bit, input.deviceVideoCamera ?? null)
            .input("deviceManufacturer", mssql_1.default.NVarChar(255), cleanOptional(input.deviceManufacturer))
            .input("deviceSerialNumber", mssql_1.default.NVarChar(120), cleanOptional(input.deviceSerialNumber))
            .input("deviceAccessories", mssql_1.default.NVarChar(500), cleanOptional(input.deviceAccessories))
            .input("deviceDepositNote", mssql_1.default.NVarChar(500), cleanOptional(input.deviceDepositNote))
            .query(`
        INSERT INTO dbo.visits (
          client_request_id,
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
          created_by,
          created_via_public_form,
          notes,
          device_photo_app,
          device_film_app,
          device_video_camera,
          device_manufacturer,
          device_serial_number,
          device_accessories,
          device_deposit_note,
          check_in_at,
          check_in_by
        )
        OUTPUT inserted.id, inserted.status
        VALUES (
          @clientRequestId,
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
          '${visitStatus}',
          '${visitWorkflow_1.APPROVAL_STATUS.NOT_REQUIRED}',
          @checkInBy,
          0,
          @notes,
          @devicePhotoApp,
          @deviceFilmApp,
          @deviceVideoCamera,
          @deviceManufacturer,
          @deviceSerialNumber,
          @deviceAccessories,
          @deviceDepositNote,
          ${action === "save" ? "NULL" : "SYSUTCDATETIME()"},
          ${action === "save" ? "NULL" : "@checkInBy"}
        )
      `);
        const visit = visitInsert.recordset[0];
        if (!visit) {
            throw new Error("visit_insert_failed");
        }
        await (0, auditLog_1.writeAuditLog)({
            user: user.username,
            userId: user.id,
            action: "guard_visit_created",
            objectType: "visit",
            objectId: visit.id,
            ipAddress,
            userAgent,
            metadata: {
                source: "guard_walk_in",
                badgeNumber,
                gateId: user.gateId,
                visitorId,
                reusedVisitor: visitorWasReused,
                status: visit.status
            }
        }, transaction);
        if (action !== "save") {
            await (0, auditLog_1.writeAuditLog)({
                user: user.username,
                userId: user.id,
                action: "guard_visitor_checked_in",
                objectType: "visit",
                objectId: visit.id,
                ipAddress,
                userAgent,
                metadata: {
                    gateId: user.gateId,
                    visitorId,
                    badgeNumber
                }
            }, transaction);
        }
        await transaction.commit();
        return {
            visitId: visit.id,
            visitorId: visitorId,
            badgeNumber,
            status: visit.status
        };
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function checkOutVisit(user, visitId, returnedBadgeNumber, signature, checkoutNote, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (!visit.gateId || !(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        (0, visitWorkflow_1.assertCanCheckOut)(visit.status, signature);
        const normalizedReturnedBadgeNumber = returnedBadgeNumber.trim();
        const expectedBadgeNumber = (visit.badgeNumber?.trim() || visit.id.slice(0, 8).toUpperCase());
        (0, visitWorkflow_1.assertReturnedBadgeNumberMatches)(expectedBadgeNumber, normalizedReturnedBadgeNumber);
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
        const existingSignatureDate = visit.hostSignatureDate
            ? new Date(visit.hostSignatureDate).toISOString().slice(0, 10)
            : null;
        const existingSignatureNote = visit.hostSignatureNote?.trim() || null;
        const existingSignatureStatus = visit.hostSignatureStatus || visitWorkflow_1.HOST_SIGNATURE_STATUS.PENDING;
        const shouldPreserveExistingConfirmation = (existingSignatureStatus === signature.status
            && existingSignatureDate === normalizedSignatureDate
            && existingSignatureNote === normalizedSignatureNote
            && Boolean(visit.hostSignatureConfirmedBy)
            && Boolean(visit.hostSignatureConfirmedAt));
        await new mssql_1.default.Request(transaction)
            .input("visitId", mssql_1.default.UniqueIdentifier, visitId)
            .input("checkoutNote", mssql_1.default.NVarChar(mssql_1.default.MAX), checkoutNote?.trim() || null)
            .input("signatureStatus", mssql_1.default.NVarChar(40), signature.status)
            .input("signatureDate", mssql_1.default.Date, normalizedSignatureDate)
            .input("signatureNote", mssql_1.default.NVarChar(500), normalizedSignatureNote)
            .input("returnedBadgeNumber", mssql_1.default.NVarChar(64), normalizedReturnedBadgeNumber)
            .input("confirmedBy", mssql_1.default.UniqueIdentifier, shouldPreserveExistingConfirmation ? visit.hostSignatureConfirmedBy ?? null : user.id)
            .input("preserveConfirmedAt", mssql_1.default.Bit, shouldPreserveExistingConfirmation)
            .query(`
        UPDATE dbo.visits
        SET
          status = '${visitWorkflow_1.VISIT_STATUS.CHECKED_OUT}',
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
                signature_status: signature.status,
                preserved_signature_confirmation: shouldPreserveExistingConfirmation,
                returned_badge_number_checked: true
            }
        }, transaction);
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function updateHostSignatureForGuard(user, visitId, signature, ipAddress, userAgent) {
    const pool = await (0, db_1.getPool)();
    const transaction = new mssql_1.default.Transaction(pool);
    await transaction.begin();
    try {
        const visit = await loadVisitForUpdate(transaction, visitId);
        if (!visit) {
            throw new Error("visit_not_found");
        }
        if (!visit.gateId || !(0, visitWorkflow_1.canAccessGate)(user, visit.gateId)) {
            throw new Error("visit_scope_forbidden");
        }
        (0, visitWorkflow_1.assertCanUpdateHostSignature)(visit.status, signature);
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
            .input("signatureStatus", mssql_1.default.NVarChar(40), signature.status)
            .input("signatureDate", mssql_1.default.Date, normalizedSignatureDate)
            .input("signatureNote", mssql_1.default.NVarChar(500), normalizedSignatureNote)
            .input("confirmedBy", mssql_1.default.UniqueIdentifier, user.id)
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
        await (0, auditLog_1.writeAuditLog)({
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
        if (!(0, visitWorkflow_1.canManageGuardScopedVisit)(user, visit, { allowUnassignedPreRegistered: true })) {
            throw new Error("visit_scope_forbidden");
        }
        let nextGateId = visit.gateId ?? null;
        if (typeof input.gateId === "string" && input.gateId.trim().length > 0) {
            if (!(0, visitWorkflow_1.canAccessGate)(user, input.gateId)) {
                throw new Error("visit_scope_forbidden");
            }
            nextGateId = input.gateId;
        }
        else if (user.role === "admin") {
            nextGateId = null;
        }
        if (visit.status !== visitWorkflow_1.VISIT_STATUS.PRE_REGISTERED && visit.status !== visitWorkflow_1.VISIT_STATUS.CHECKED_IN) {
            throw new Error("visit_update_status_forbidden");
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
            .input("hostDepartment", mssql_1.default.NVarChar(255), input.hostDepartment?.trim() || null)
            .input("purpose", mssql_1.default.NVarChar(500), input.purpose.trim())
            .input("gateId", mssql_1.default.UniqueIdentifier, nextGateId)
            .input("validFrom", mssql_1.default.DateTime2, normalizeDateOnlyStart(input.validFrom))
            .input("validUntil", mssql_1.default.DateTime2, normalizeDateOnlyEnd(input.validUntil))
            .input("notes", mssql_1.default.NVarChar(mssql_1.default.MAX), input.notes?.trim() || null)
            .input("visitorStreet", mssql_1.default.NVarChar(255), input.visitorStreet?.trim() || null)
            .input("visitorHouseNumber", mssql_1.default.NVarChar(40), input.visitorHouseNumber?.trim() || null)
            .input("visitorPostalCode", mssql_1.default.NVarChar(20), input.visitorPostalCode?.trim() || null)
            .input("visitorCity", mssql_1.default.NVarChar(120), input.visitorCity?.trim() || null)
            .input("visitorAddress", mssql_1.default.NVarChar(500), input.visitorAddress?.trim() || null)
            .input("idDocumentType", mssql_1.default.NVarChar(40), input.idDocumentType?.trim() || null)
            .input("idDocumentValidUntil", mssql_1.default.Date, input.idDocumentValidUntil?.trim() || null)
            .input("idDocumentNumber", mssql_1.default.NVarChar(120), input.idDocumentNumber?.trim() || null)
            .input("idDocumentIssuingPlace", mssql_1.default.NVarChar(255), input.idDocumentIssuingPlace?.trim() || null)
            .input("visitPurposeType", mssql_1.default.NVarChar(40), input.visitPurposeType?.trim() || null)
            .input("visitCompanyOrder", mssql_1.default.NVarChar(500), input.visitCompanyOrder?.trim() || null)
            .input("hostUnit", mssql_1.default.NVarChar(255), input.hostUnit?.trim() || null)
            .input("hostBuilding", mssql_1.default.NVarChar(120), input.hostBuilding?.trim() || null)
            .input("hostRoom", mssql_1.default.NVarChar(80), input.hostRoom?.trim() || null)
            .input("hostExtension", mssql_1.default.NVarChar(80), input.hostExtension?.trim() || null)
            .input("visitEndType", mssql_1.default.NVarChar(40), input.visitEndType?.trim() || null)
            .input("forwardedToNote", mssql_1.default.NVarChar(500), input.forwardedToNote?.trim() || null)
            .input("devicePhotoApp", mssql_1.default.Bit, input.devicePhotoApp ?? null)
            .input("deviceFilmApp", mssql_1.default.Bit, input.deviceFilmApp ?? null)
            .input("deviceVideoCamera", mssql_1.default.Bit, input.deviceVideoCamera ?? null)
            .input("deviceManufacturer", mssql_1.default.NVarChar(255), input.deviceManufacturer?.trim() || null)
            .input("deviceSerialNumber", mssql_1.default.NVarChar(120), input.deviceSerialNumber?.trim() || null)
            .input("deviceAccessories", mssql_1.default.NVarChar(500), input.deviceAccessories?.trim() || null)
            .input("deviceDepositNote", mssql_1.default.NVarChar(500), input.deviceDepositNote?.trim() || null)
            .input("deviceReturnConfirmed", mssql_1.default.Bit, input.deviceReturnConfirmed ?? null)
            .input("deviceReturnedAt", mssql_1.default.DateTime2, input.deviceReturnedAt?.trim() ? new Date(input.deviceReturnedAt) : null)
            .input("deviceReturnedBy", mssql_1.default.UniqueIdentifier, input.deviceReturnConfirmed ? user.id : null)
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
        await (0, auditLog_1.writeAuditLog)({
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
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}

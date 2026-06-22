import sql from "mssql";
import * as XLSX from "xlsx";
import { writeAuditLog } from "./auditLog";
import { generateBadgeNumberCandidate } from "./badgeNumber";
import { getPool } from "./db";
import { findActiveGateById, listActiveGates } from "./publicPreRegistrations";
import { getVisitCompleteness } from "./guardVisits";
import { VISIT_STATUS, type AuthenticatedUser } from "./visitWorkflow";

export const MISSING_IMPORT_VALUE = "[fehlt]";

export type ImportVisitInput = {
  gateId?: string | null;
  gateName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  licensePlate?: string | null;
  hostName?: string | null;
  hostEmail?: string | null;
  hostPhone?: string | null;
  hostDepartment?: string | null;
  purpose?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  idDocumentType?: string | null;
  idDocumentValidUntil?: string | null;
  idDocumentNumber?: string | null;
  notes?: string | null;
};

export type ImportVisitResult = {
  rowNumber: number;
  visitId: string;
  visitorId: string;
  badgeNumber: string;
  visitorName: string;
  company: string;
  missingFields: string[];
  warnings: string[];
  needsReview: boolean;
};

export type ImportVisitsResult = {
  imported: number;
  needsReview: number;
  rows: ImportVisitResult[];
};

type ImportTemplateColumn = {
  header: string;
  samples: [string, string];
};

type ExcelImportTemplateColumn = ImportTemplateColumn & {
  section: "visitor" | "host" | "visit";
  required: boolean;
};

const visitorImportCsvTemplateColumns: ImportTemplateColumn[] = [
  { header: "Vorname [Pflicht]", samples: ["Max", "Erika"] },
  { header: "Nachname [Pflicht]", samples: ["Beispiel", "Import"] },
  { header: "Firma / Organisation [Pflicht]", samples: ["Musterfirma GmbH", "Test AG"] },
  { header: "Ansprechpartner [Pflicht]", samples: ["Maria Muster", "Peter Beispiel"] },
  { header: "Besuchszweck [Pflicht]", samples: ["Projektbesprechung", "Kurztermin"] },
  { header: "Gültig von [Pflicht]", samples: ["19.06.2026", "19.06.2026"] },
  { header: "Gültig bis [Pflicht]", samples: ["19.06.2026", "19.06.2026"] },
  { header: "Wache [Optional]", samples: ["Hauptwache", ""] },
  { header: "Geburtsdatum [Optional]", samples: ["15.04.1988", ""] },
  { header: "Telefon [Optional]", samples: ["+49 151 12345678", ""] },
  { header: "E-Mail [Optional]", samples: ["max.beispiel@musterfirma.de", ""] },
  { header: "Kennzeichen [Optional]", samples: ["B-MB 1234", ""] },
  { header: "Ansprechpartner Telefon [Optional]", samples: ["+49 30 123456", ""] },
  { header: "Ansprechpartner E-Mail [Optional]", samples: ["maria.muster@wiweb.de", "peter.beispiel@wiweb.de"] },
  { header: "Abteilung / Bereich [Optional]", samples: ["Werksschutz", "IT"] },
  { header: "Ausweisart [Optional]", samples: ["Personalausweis", "Reisepass"] },
  { header: "Ausweis gültig bis [Optional]", samples: ["31.12.2030", "01.09.2028"] },
  { header: "Ausweisnummer [Optional]", samples: ["L01X00ABC", "XK998877"] },
  { header: "Bemerkung [Optional]", samples: ["Beispielimport mit vollständigen Daten", ""] },
  { header: "GateId [Optional]", samples: ["", ""] }
];

const visitorImportExcelTemplateColumns: ExcelImportTemplateColumn[] = [
  { header: "Vorname [Pflicht]", samples: ["", ""], section: "visitor", required: true },
  { header: "Nachname [Pflicht]", samples: ["", ""], section: "visitor", required: true },
  { header: "Firma / Organisation [Pflicht]", samples: ["", ""], section: "visitor", required: true },
  { header: "Geburtsdatum [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "Telefon [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "E-Mail [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "Kennzeichen [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "Ausweisart [Pflicht]", samples: ["", ""], section: "visitor", required: true },
  { header: "Ausweis gültig bis [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "Ausweisnummer [Pflicht]", samples: ["", ""], section: "visitor", required: true },
  { header: "Bemerkung [Optional]", samples: ["", ""], section: "visitor", required: false },
  { header: "Ansprechpartner [Pflicht]", samples: ["", ""], section: "host", required: true },
  { header: "Ansprechpartner Telefon [Pflicht]", samples: ["", ""], section: "host", required: true },
  { header: "Ansprechpartner E-Mail [Optional]", samples: ["", ""], section: "host", required: false },
  { header: "Abteilung / Bereich [Optional]", samples: ["", ""], section: "host", required: false },
  { header: "Besuchszweck [Pflicht]", samples: ["", ""], section: "visit", required: true },
  { header: "Gültig von [Pflicht]", samples: ["", ""], section: "visit", required: true },
  { header: "Gültig bis [Pflicht]", samples: ["", ""], section: "visit", required: true }
];

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
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const importedRows: ImportVisitResult[] = [];

    for (const [index, row] of rows.entries()) {
      const badgeNumber = await generateUniqueBadgeNumber(transaction);
      const validFrom = normalizeDateOnly(row.validFrom) ?? todayDateOnly();
      const validUntil = normalizeDateOnly(row.validUntil) ?? validFrom;
      const idDocumentValidUntil = normalizeDateOnly(row.idDocumentValidUntil);
      const idDocumentType = normalizeIdDocumentType(row.idDocumentType);
      const birthDate = normalizeDateOnly(row.birthDate);
      const gateId = await resolveGateId(row, options.fallbackGateId);

      const visitorInsert = await new sql.Request(transaction)
        .input("firstName", sql.NVarChar(120), requiredOrPlaceholder(row.firstName))
        .input("lastName", sql.NVarChar(120), requiredOrPlaceholder(row.lastName))
        .input("company", sql.NVarChar(255), requiredOrPlaceholder(row.company))
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

const columnAliases: Record<string, keyof ImportVisitInput> = {
  wache: "gateName",
  eingang: "gateName",
  gate: "gateName",
  wacheid: "gateId",
  gateid: "gateId",
  vorname: "firstName",
  firstname: "firstName",
  first_name: "firstName",
  nachname: "lastName",
  lastname: "lastName",
  last_name: "lastName",
  firma: "company",
  firmaorganisation: "company",
  organisation: "company",
  organization: "company",
  company: "company",
  geburtsdatum: "birthDate",
  birthdate: "birthDate",
  telefon: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  kennzeichen: "licensePlate",
  licenseplate: "licensePlate",
  ansprechpartner: "hostName",
  gastgeber: "hostName",
  hostname: "hostName",
  "ansprechpartnertelefon": "hostPhone",
  "ansprechpartner_telefon": "hostPhone",
  hostphone: "hostPhone",
  "ansprechpartneremail": "hostEmail",
  "ansprechpartner_e-mail": "hostEmail",
  hostemail: "hostEmail",
  abteilung: "hostDepartment",
  abteilungbereich: "hostDepartment",
  bereich: "hostDepartment",
  besuchszweck: "purpose",
  zweck: "purpose",
  purpose: "purpose",
  "gueltigvon": "validFrom",
  "gültigvon": "validFrom",
  "validfrom": "validFrom",
  "gueltigbis": "validUntil",
  "gültigbis": "validUntil",
  "validuntil": "validUntil",
  ausweisart: "idDocumentType",
  dokumentart: "idDocumentType",
  "ausweisgueltigbis": "idDocumentValidUntil",
  "ausweisgültigbis": "idDocumentValidUntil",
  dokumentgueltigbis: "idDocumentValidUntil",
  dokumentgültigbis: "idDocumentValidUntil",
  ausweisnummer: "idDocumentNumber",
  dokumentnummer: "idDocumentNumber",
  bemerkung: "notes",
  notiz: "notes",
  notes: "notes"
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\[[^\]]*]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/[./-]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function getVisitorImportTemplateHeaders(): string[] {
  return visitorImportCsvTemplateColumns.map((column) => column.header);
}

export function getVisitorImportTemplateRows(): string[][] {
  return [0, 1].map((sampleIndex) => visitorImportCsvTemplateColumns.map((column) => column.samples[sampleIndex] ?? ""));
}

export function getVisitorImportExcelTemplateColumns(): ExcelImportTemplateColumn[] {
  return visitorImportExcelTemplateColumns.map((column) => ({ ...column }));
}

export function getVisitorImportExcelTemplateHeaders(): string[] {
  return visitorImportExcelTemplateColumns.map((column) => column.header);
}

function mapTableRows(rows: unknown[][]): ImportVisitInput[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) {
    return [];
  }

  const mappedHeaders = headerRow.map((header) => columnAliases[normalizeHeader(header)]);
  return dataRows
    .map((row) => {
      const item: ImportVisitInput = {};
      row.forEach((value, index) => {
        const key = mappedHeaders[index];
        if (key) {
          item[key] = cleanOptional(String(value ?? ""));
        }
      });
      return item;
    })
    .filter((item) => Object.values(item).some((value) => cleanOptional(value)));
}

export function parseCsvBuffer(buffer: Buffer): ImportVisitInput[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const delimiter = (text.split("\n")[0]?.match(/;/g)?.length ?? 0) >= (text.split("\n")[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cleanOptional(cell))) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cleanOptional(cell))) {
    rows.push(row);
  }

  return mapTableRows(rows);
}

export function parseExcelBuffer(buffer: Buffer): ImportVisitInput[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: ""
  });

  return mapTableRows(rows);
}

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { findCountryCode } from "./countries";
import { listActiveGates, type GateSummary } from "./publicPreRegistrations";
import { cleanOptional } from "./textValues";
import { normalizeImportDateOnly } from "./visitImport";
import type { ImportVisitInput } from "./visitImportDefinitions";
import { parseExcelBufferWithMetadata } from "./visitImportParsing";

export const PUBLIC_XLSX_LIMITS = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxRows: 500, maxSheets: 3, maxExpandedBytes: 30 * 1024 * 1024 });

export class PublicXlsxError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export type PublicApplicationPreviewRow = {
  rowNumber: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  nationalityCode: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  licensePlate: string | null;
  gateId: string | null;
  gateName: string | null;
  hostName: string | null;
  hostPhone: string | null;
  hostEmail: string | null;
  hostDepartment: string | null;
  purpose: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  warnings: string[];
  errors: string[];
};

function optional(value: string | null | undefined, max: number): string | null {
  return cleanOptional(value)?.replace(/\s+/g, " ").slice(0, max) ?? null;
}

export async function assertSafePublicXlsx(buffer: Buffer): Promise<void> {
  if (buffer.length > PUBLIC_XLSX_LIMITS.maxBytes || buffer.length < 4 || buffer.subarray(0, 2).toString("hex") !== "504b") {
    throw new PublicXlsxError("INVALID_XLSX", "Die Datei konnte nicht gelesen werden. Bitte verwenden Sie die aktuelle XLSX-Vorlage.");
  }
  let archive: JSZip;
  try { archive = await JSZip.loadAsync(buffer); } catch { throw new PublicXlsxError("INVALID_XLSX", "Die Datei konnte nicht gelesen werden. Bitte verwenden Sie die aktuelle XLSX-Vorlage."); }
  const names = Object.keys(archive.files);
  const forbidden = /(^|\/)(vbaProject\.bin|activeX|embeddings|externalLinks|connections\.xml|customUI)(\/|$)/i;
  if (names.some((name) => name.includes("..") || name.startsWith("/") || forbidden.test(name))) {
    throw new PublicXlsxError("UNSAFE_XLSX", "Die Datei enthält nicht unterstützte aktive oder externe Inhalte.");
  }
  const sheets = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (sheets.length === 0 || sheets.length > PUBLIC_XLSX_LIMITS.maxSheets) {
    throw new PublicXlsxError("SHEET_LIMIT", `Die Datei darf höchstens ${PUBLIC_XLSX_LIMITS.maxSheets} Tabellenblätter enthalten.`);
  }
  let expanded = 0;
  for (const name of names) {
    const file = archive.file(name);
    if (!file) continue;
    expanded += (await file.async("uint8array")).byteLength;
    if (expanded > PUBLIC_XLSX_LIMITS.maxExpandedBytes) throw new PublicXlsxError("XLSX_EXPANDED_TOO_LARGE", "Die entpackten XLSX-Inhalte sind zu groß.");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => row.eachCell((cell) => {
      const value = cell.value as unknown;
      if (value && typeof value === "object" && "formula" in (value as Record<string, unknown>)) {
        throw new PublicXlsxError("FORMULA_NOT_ALLOWED", `Formeln sind nicht erlaubt (Zeile ${cell.row}, Spalte ${cell.col}).`);
      }
    }));
  }
}

export async function parseAndValidatePublicApplicationXlsx(buffer: Buffer, activeGates?: readonly GateSummary[]): Promise<{ rows: PublicApplicationPreviewRow[]; ignoredSampleRows: number; valid: boolean }> {
  await assertSafePublicXlsx(buffer);
  const parsed = await parseExcelBufferWithMetadata(buffer);
  if (parsed.rows.length === 0) throw new PublicXlsxError("EMPTY_XLSX", "Die Datei enthält keine Besucher.");
  if (parsed.rows.length > PUBLIC_XLSX_LIMITS.maxRows) throw new PublicXlsxError("ROW_LIMIT", `Die Datei enthält mehr als ${PUBLIC_XLSX_LIMITS.maxRows} Personen.`);
  const gates = activeGates ?? await listActiveGates();
  const rows = parsed.rows.map((row, index) => normalizeRow(row, index, gates));
  return { rows, ignoredSampleRows: parsed.ignoredSampleRows, valid: rows.every((row) => row.errors.length === 0) };
}

function normalizeRow(row: ImportVisitInput, index: number, gates: readonly GateSummary[]): PublicApplicationPreviewRow {
  const rowNumber = row.sourceExcelRowNumber ?? index + 2;
  const errors: string[] = [];
  const warnings: string[] = [];
  const gateNameInput = optional(row.gateName, 120);
  const gate = gates.find((candidate) => candidate.name.localeCompare(gateNameInput ?? "", "de", { sensitivity: "base" }) === 0);
  if (!gateNameInput) errors.push("Wache fehlt.");
  else if (!gate) {
    const examples = gates.slice(0, 3).map((candidate) => `„${candidate.name}“`).join(", ");
    errors.push(examples
      ? `Wache „${gateNameInput}“ ist nicht aktiv oder unbekannt. Erwartet wird der exakte Name einer aktiven Wache, zum Beispiel ${examples}.`
      : `Wache „${gateNameInput}“ ist nicht aktiv oder unbekannt. Derzeit ist keine aktive Wache auswählbar.`);
  }
  const validFrom = normalizeImportDateOnly(row.validFrom);
  const validUntil = normalizeImportDateOnly(row.validUntil);
  if (!optional(row.validFrom, 40)) errors.push("Gültig von fehlt.");
  else if (!validFrom) errors.push("Gültig von ist ungültig.");
  if (!optional(row.validUntil, 40)) errors.push("Gültig bis fehlt.");
  else if (!validUntil) errors.push("Gültig bis ist ungültig.");
  if (validFrom && validUntil && validUntil < validFrom) errors.push("Gültig bis liegt vor Gültig von.");
  const nationality = optional(row.nationalityCode, 120);
  const nationalityCode = nationality ? findCountryCode(nationality) : null;
  if (nationality && !nationalityCode) errors.push(`Nationalität „${nationality}“ ist ungültig. Erwartet wird ein zweistelliger ISO-Code oder ein deutscher Ländername, zum Beispiel „DE“ oder „Deutschland“.`);
  const birthDate = normalizeImportDateOnly(row.birthDate);
  if (optional(row.birthDate, 40) && !birthDate) errors.push("Geburtsdatum ist ungültig.");
  const email = optional(row.email, 255)?.toLowerCase() ?? null;
  const hostEmail = optional(row.hostEmail, 255)?.toLowerCase() ?? null;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailPattern.test(email)) errors.push("E-Mail ist ungültig.");
  if (hostEmail && !emailPattern.test(hostEmail)) errors.push("Ansprechpartner-E-Mail ist ungültig.");
  if (!optional(row.firstName, 120) && !optional(row.lastName, 120)) warnings.push("Kein Besuchername angegeben.");
  return {
    rowNumber, firstName: optional(row.firstName, 120), lastName: optional(row.lastName, 120), company: optional(row.company, 255),
    nationalityCode, birthDate, phone: optional(row.phone, 80), email, licensePlate: optional(row.licensePlate, 40), gateId: gate?.id ?? null,
    gateName: gate?.name ?? gateNameInput, hostName: optional(row.hostName, 255), hostPhone: optional(row.hostPhone, 80), hostEmail,
    hostDepartment: optional(row.hostDepartment, 255), purpose: optional(row.purpose, 500), validFrom, validUntil, notes: optional(row.notes, 2000), warnings, errors
  };
}

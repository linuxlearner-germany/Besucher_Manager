import ExcelJS from "exceljs";
import { z } from "zod";
import { COUNTRIES, findCountryCode } from "./countries";
import { normalizeIdDocumentType, normalizeImportDateOnly } from "./importNormalization";
import { loadExcelWorkbook } from "./visitImportParsing";

export type SimplifiedRegistrationImportRow = {
  sourceRow: number;
  firstName: string;
  lastName: string;
  company: string;
  nationalityCode: string;
  phone: string;
  email: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  idDocumentType: string;
  idDocumentValidUntil: string;
  idDocumentNumber: string;
  licensePlate: string;
  hostName: string;
  hostPhone: string;
  hostEmail: string;
  hostDepartment: string;
  purpose: string;
  notes: string;
  barracksAreaName: string;
  gateName: string;
  proposedValidFrom: string;
  proposedValidUntil: string;
};

const columns = [
  ["_Beispielzeile", "example"], ["Vorname", "firstName"], ["Nachname", "lastName"],
  ["Firma / Organisation", "company"], ["Nationalität", "nationalityCode"], ["Telefon", "phone"],
  ["E-Mail", "email"], ["Straße", "street"], ["Hausnummer", "houseNumber"], ["PLZ", "postalCode"],
  ["Ort", "city"], ["Ausweisart", "idDocumentType"], ["Ausweis gültig bis", "idDocumentValidUntil"],
  ["Ausweisnummer", "idDocumentNumber"], ["Kennzeichen", "licensePlate"], ["Ansprechpartner", "hostName"],
  ["Ansprechpartner Telefon", "hostPhone"], ["Ansprechpartner E-Mail", "hostEmail"],
  ["Geschäftsfeld / Abteilung", "hostDepartment"], ["Besuchszweck / Tätigkeit", "purpose"],
  ["Bemerkung", "notes"], ["Kasernenbereich", "barracksAreaName"], ["Wache", "gateName"],
  ["Gültig von (Vorschlag)", "proposedValidFrom"], ["Gültig bis (Vorschlag)", "proposedValidUntil"]
] as const;

const exampleRows = [
  ["BEISPIEL", "Max", "Mustermann", "Musterbau GmbH", "Deutschland", "+49 151 123456", "max@example.org", "Musterweg", "12", "10115", "Berlin", "Personalausweis", "31.12.2030", "L01X00ABC", "B-MM 123", "Maria Muster", "+49 30 123456", "maria@example.org", "Bau", "Montagearbeiten", "Beispiel – nicht importieren", "Standardbereich", "Hauptwache", "01.09.2026", "31.12.2026"],
  ["BEISPIEL", "Erika", "Beispiel", "Service Nord", "Österreich", "", "", "", "", "", "", "Reisepass", "", "", "", "Peter Beispiel", "", "", "IT", "Wartung", "Beispiel – nicht importieren", "Standardbereich", "", "01.10.2026", "31.10.2026"]
];

const rowSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname fehlt."),
  lastName: z.string().trim().min(1, "Nachname fehlt."),
  company: z.string().trim().min(1, "Firma / Organisation fehlt."),
  nationalityCode: z.string().trim().min(1, "Nationalität fehlt."),
  email: z.string().trim().email("Besucher-E-Mail ist ungültig.").or(z.literal("")),
  hostEmail: z.string().trim().email("Ansprechpartner-E-Mail ist ungültig.").or(z.literal("")),
  barracksAreaName: z.string().trim().min(1, "Kasernenbereich fehlt."),
  proposedValidFrom: z.string().trim().min(1, "Gültig von fehlt."),
  proposedValidUntil: z.string().trim().min(1, "Gültig bis fehlt.")
});

export class SimplifiedExcelValidationError extends Error {
  constructor(public readonly messages: string[]) { super("invalid_simplified_registration_excel"); }
}

export async function buildSimplifiedRegistrationTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Besucher Manager";
  const sheet = workbook.addWorksheet("Vereinfachte Anmeldung", { views: [{ state: "frozen", ySplit: 1 }] });
  const hints = workbook.addWorksheet("Hinweise");
  const lists = workbook.addWorksheet("Listen");
  sheet.columns = columns.map(([header, key], index) => ({ header, key, width: index === 0 ? 3 : Math.max(16, Math.min(header.length + 4, 30)), hidden: index === 0 }));
  const header = sheet.getRow(1);
  header.height = 34;
  header.eachCell((cell, index) => {
    const section = index <= 15 ? "FFD8EAFB" : index <= 21 ? "FFDFF4DC" : "FFFDE7BF";
    cell.font = { bold: true, color: { argb: "FF10233A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: section } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  exampleRows.forEach((values) => sheet.addRow(Object.fromEntries(columns.map(([header], index) => [header, values[index] ?? ""]))));
  for (let rowNumber = 4; rowNumber <= 153; rowNumber += 1) sheet.getRow(rowNumber).height = 22;
  sheet.autoFilter = { from: "B1", to: `Y153` };
  COUNTRIES.forEach((country, index) => { lists.getCell(index + 1, 1).value = country.name; });
  ["Personalausweis", "Reisepass", "Dienstausweis", "Sonstiges"].forEach((value, index) => { lists.getCell(index + 1, 2).value = value; });
  lists.state = "veryHidden";
  for (let row = 4; row <= 153; row += 1) {
    sheet.getCell(row, 5).dataValidation = { type: "list", allowBlank: false, formulae: [`Listen!$A$1:$A$${COUNTRIES.length}`], showErrorMessage: true, error: "Bitte eine Nationalität auswählen." };
    sheet.getCell(row, 12).dataValidation = { type: "list", allowBlank: true, formulae: ["Listen!$B$1:$B$4"] };
    for (const column of [13, 24, 25]) sheet.getCell(row, column).numFmt = "dd.mm.yyyy";
  }
  hints.getCell("A1").value = "Vereinfachte Besucheranmeldung";
  hints.getCell("A1").font = { bold: true, size: 15 };
  hints.getCell("A3").value = "Daten ab Zeile 4 eintragen. Die beiden farbigen Beispielzeilen werden immer ignoriert.";
  hints.getCell("A4").value = "Pflicht: Vorname, Nachname, Firma, Nationalität, Kasernenbereich und vorgeschlagener Zeitraum.";
  hints.getCell("A5").value = "Der KasKdt entscheidet später über Genehmigung, Wache und endgültigen Gültigkeitszeitraum.";
  hints.getCell("A6").value = "Eine Datei erzeugt genau einen Vorgang; jede Person kann einzeln genehmigt oder abgelehnt werden.";
  hints.getColumn(1).width = 120;
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

function text(cell: ExcelJS.Cell): string { return cell.text.trim(); }

export async function parseSimplifiedRegistrationExcel(buffer: Buffer): Promise<SimplifiedRegistrationImportRow[]> {
  const workbook = await loadExcelWorkbook(buffer);
  const sheet = workbook.getWorksheet("Vereinfachte Anmeldung") ?? workbook.worksheets[0];
  if (!sheet) throw new SimplifiedExcelValidationError(["Die Arbeitsmappe enthält kein Tabellenblatt."]);
  const headerMap = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, index) => headerMap.set(text(cell).toLowerCase(), index));
  const missingHeaders = columns.slice(1).filter(([header]) => !headerMap.has(header.toLowerCase())).map(([header]) => header);
  if (missingHeaders.length) throw new SimplifiedExcelValidationError([`Spalten fehlen: ${missingHeaders.join(", ")}. Bitte die bereitgestellte Vorlage verwenden.`]);
  const rows: SimplifiedRegistrationImportRow[] = [];
  const errors: string[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const markerColumn = headerMap.get("_beispielzeile");
    if (markerColumn && text(row.getCell(markerColumn)).toUpperCase() === "BEISPIEL") continue;
    const values = Object.fromEntries(columns.slice(1).map(([header, key]) => [key, text(row.getCell(headerMap.get(header.toLowerCase())!))])) as Omit<SimplifiedRegistrationImportRow, "sourceRow">;
    if (!Object.values(values).some(Boolean)) continue;
    const parsed = rowSchema.safeParse(values);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `Zeile ${rowNumber}: ${issue.message}`));
      continue;
    }
    const nationalityCode = findCountryCode(values.nationalityCode);
    if (!nationalityCode) errors.push(`Zeile ${rowNumber}: Nationalität ist unbekannt.`);
    const from = normalizeImportDateOnly(values.proposedValidFrom);
    const until = normalizeImportDateOnly(values.proposedValidUntil);
    const idDocumentValidUntil = values.idDocumentValidUntil ? normalizeImportDateOnly(values.idDocumentValidUntil) : "";
    if (!from) errors.push(`Zeile ${rowNumber}: Gültig von ist ungültig.`);
    if (!until) errors.push(`Zeile ${rowNumber}: Gültig bis ist ungültig.`);
    if (from && until && until < from) errors.push(`Zeile ${rowNumber}: Gültig bis liegt vor Gültig von.`);
    if (values.idDocumentValidUntil && !idDocumentValidUntil) errors.push(`Zeile ${rowNumber}: Ausweis gültig bis ist ungültig.`);
    if (nationalityCode && from && until && (!values.idDocumentValidUntil || idDocumentValidUntil)) rows.push({
      ...values,
      sourceRow: rowNumber,
      nationalityCode,
      idDocumentType: normalizeIdDocumentType(values.idDocumentType) ?? "",
      idDocumentValidUntil: idDocumentValidUntil ?? "",
      proposedValidFrom: from,
      proposedValidUntil: until
    });
  }
  if (errors.length) throw new SimplifiedExcelValidationError(errors);
  if (!rows.length) throw new SimplifiedExcelValidationError(["Keine Besucher gefunden. Daten müssen ab Zeile 4 eingetragen werden."]);
  if (rows.length > 250) throw new SimplifiedExcelValidationError(["Bitte maximal 250 Besucher pro Datei importieren."]);
  return rows;
}

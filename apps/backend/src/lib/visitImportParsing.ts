import ExcelJS from "exceljs";
import {
  getVisitorImportTemplateSampleRowsForHeaders,
  type ImportVisitInput
} from "./visitImportDefinitions";

type ImportVisitColumnKey = Exclude<keyof ImportVisitInput, "sourceExcelRowNumber">;

const columnAliases: Record<string, ImportVisitColumnKey> = {
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
  strasse: "visitorStreet",
  straße: "visitorStreet",
  street: "visitorStreet",
  hausnummer: "visitorHouseNumber",
  housenumber: "visitorHouseNumber",
  plz: "visitorPostalCode",
  postleitzahl: "visitorPostalCode",
  postalcode: "visitorPostalCode",
  ort: "visitorCity",
  wohnort: "visitorCity",
  stadt: "visitorCity",
  city: "visitorCity",
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
  nationalitaet: "nationalityCode",
  staatsangehoerigkeit: "nationalityCode",
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

function cleanCellValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

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

export type ParsedExcelImport = {
  rows: ImportVisitInput[];
  ignoredSampleRows: number;
};

function isEmptyRow(row: unknown[]): boolean {
  return !row.some((value) => cleanCellValue(value));
}

function isUnchangedSampleRow(row: unknown[], sampleRows: string[][]): boolean {
  return sampleRows.some((sampleRow) => {
    const cellCount = Math.max(row.length, sampleRow.length);
    for (let index = 0; index < cellCount; index += 1) {
      const actual = row[index] === null || row[index] === undefined ? "" : String(row[index]);
      const expected = sampleRow[index] ?? "";
      if (actual !== expected) {
        return false;
      }
    }
    return true;
  });
}

function mapTableRows(rows: unknown[][]): ParsedExcelImport {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) {
    return { rows: [], ignoredSampleRows: 0 };
  }

  const mappedHeaders = headerRow.map((header) => columnAliases[normalizeHeader(header)]);
  const sampleRows = getVisitorImportTemplateSampleRowsForHeaders(headerRow);
  let ignoredSampleRows = 0;

  const mappedRows = dataRows
    .flatMap((row, index) => {
      if (isEmptyRow(row)) {
        return [];
      }
      if (isUnchangedSampleRow(row, sampleRows)) {
        ignoredSampleRows += 1;
        return [];
      }

      const item: ImportVisitInput = {};
      row.forEach((value, index) => {
        const key = mappedHeaders[index];
        const cleaned = cleanCellValue(value);
        if (key && cleaned !== null) {
          item[key] = cleaned;
        }
      });
      if (!Object.values(item).some((value) => cleanCellValue(value))) {
        return [];
      }
      item.sourceExcelRowNumber = index + 2;
      return [item];
    });
  return { rows: mappedRows, ignoredSampleRows };
}

export async function parseExcelBuffer(buffer: Buffer): Promise<ImportVisitInput[]> {
  return (await parseExcelBufferWithMetadata(buffer)).rows;
}

export async function parseExcelBufferWithMetadata(buffer: Buffer): Promise<ParsedExcelImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { rows: [], ignoredSampleRows: 0 };
  }

  const rows = Array.from({ length: worksheet.rowCount }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);
    return Array.from({ length: worksheet.columnCount }, (_, columnIndex) => row.getCell(columnIndex + 1).text);
  });

  return mapTableRows(rows);
}

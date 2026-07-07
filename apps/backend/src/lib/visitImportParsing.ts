import * as XLSX from "xlsx";
import type { ImportVisitInput } from "./visitImportDefinitions";

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
        const cleaned = cleanCellValue(value);
        if (key && cleaned !== null) {
          item[key] = cleaned;
        }
      });
      return item;
    })
    .filter((item) => Object.values(item).some((value) => cleanCellValue(value)));
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

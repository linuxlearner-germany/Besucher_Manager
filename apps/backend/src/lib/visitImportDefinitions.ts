export type ImportVisitInput = {
  sourceExcelRowNumber?: number;
  gateId?: string | null;
  gateName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  visitorStreet?: string | null;
  visitorHouseNumber?: string | null;
  visitorPostalCode?: string | null;
  visitorCity?: string | null;
  nationalityCode?: string | null;
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
  ignoredSampleRows?: number;
  rows: ImportVisitResult[];
};

type ImportTemplateColumn = {
  fieldKey: string;
  header: string;
  samples: [string, string];
};

export type ExcelImportTemplateColumn = ImportTemplateColumn & {
  section: "visitor" | "host" | "visit";
  required: boolean;
};

const visitorImportTemplateColumns: ExcelImportTemplateColumn[] = [
  { fieldKey: "visitor_first_name", header: "Vorname [Pflicht]", samples: ["Max", "Erika"], section: "visitor", required: true },
  { fieldKey: "visitor_last_name", header: "Nachname [Pflicht]", samples: ["Muster", "Sommer"], section: "visitor", required: true },
  { fieldKey: "visitor_company", header: "Firma / Organisation [Pflicht]", samples: ["Musterfirma GmbH", "Nordwerk GmbH"], section: "visitor", required: true },
  { fieldKey: "visitor_nationality", header: "Nationalität [Pflicht]", samples: ["Deutschland", "Deutschland"], section: "visitor", required: true },
  { fieldKey: "visitor_birth_date", header: "Geburtsdatum [Optional]", samples: ["15.04.1988", ""], section: "visitor", required: false },
  { fieldKey: "visitor_street", header: "Straße [Pflicht]", samples: ["Musterstraße", "Hafenweg"], section: "visitor", required: true },
  { fieldKey: "visitor_house_number", header: "Hausnummer [Pflicht]", samples: ["12a", "7"], section: "visitor", required: true },
  { fieldKey: "visitor_postal_code", header: "PLZ [Pflicht]", samples: ["10115", "20457"], section: "visitor", required: true },
  { fieldKey: "visitor_city", header: "Ort [Pflicht]", samples: ["Berlin", "Hamburg"], section: "visitor", required: true },
  { fieldKey: "visitor_phone", header: "Telefon [Optional]", samples: ["+49 151 12345678", ""], section: "visitor", required: false },
  { fieldKey: "visitor_email", header: "E-Mail [Optional]", samples: ["max.beispiel@musterfirma.de", ""], section: "visitor", required: false },
  { fieldKey: "visitor_license_plate", header: "Kennzeichen [Optional]", samples: ["B-MB 1234", ""], section: "visitor", required: false },
  { fieldKey: "id_document_type", header: "Ausweisart [Pflicht]", samples: ["Personalausweis", "Reisepass"], section: "visitor", required: true },
  { fieldKey: "id_document_valid_until", header: "Ausweis gültig bis [Pflicht]", samples: ["31.12.2030", "01.09.2028"], section: "visitor", required: true },
  { fieldKey: "id_document_number", header: "Ausweisnummer [Pflicht]", samples: ["L01X00ABC", "XK998877"], section: "visitor", required: true },
  { fieldKey: "visit_note", header: "Bemerkung [Optional]", samples: ["Lieferanteneinsatz am Vormittag", ""], section: "visitor", required: false },
  { fieldKey: "host_name", header: "Ansprechpartner [Pflicht]", samples: ["Maria Muster", "Peter Sommer"], section: "host", required: true },
  { fieldKey: "host_phone", header: "Ansprechpartner Telefon [Pflicht]", samples: ["+49 30 123456", "+49 40 987654"], section: "host", required: true },
  { fieldKey: "host_email", header: "Ansprechpartner E-Mail [Optional]", samples: ["maria.muster@wiweb.de", "peter.beispiel@wiweb.de"], section: "host", required: false },
  { fieldKey: "host_department", header: "Abteilung / Bereich [Optional]", samples: ["Werksschutz", "IT"], section: "host", required: false },
  { fieldKey: "visit_purpose", header: "Besuchszweck [Pflicht]", samples: ["Projektbesprechung", "Kurztermin"], section: "visit", required: true },
  { fieldKey: "valid_from", header: "Gültig von [Pflicht]", samples: ["19.06.2026", "19.06.2026"], section: "visit", required: true },
  { fieldKey: "valid_until", header: "Gültig bis [Pflicht]", samples: ["19.06.2026", "19.06.2026"], section: "visit", required: true }
];

export type PublicImportFieldDefinition = { fieldKey: string; requiredPublic: boolean };

function getConfiguredTemplateColumns(definitions?: readonly PublicImportFieldDefinition[]): ExcelImportTemplateColumn[] {
  if (!definitions) return visitorImportTemplateColumns.map((column) => ({ ...column }));
  const configured = new Map(definitions.map((field) => [field.fieldKey, field]));
  return visitorImportTemplateColumns
    .filter((column) => configured.has(column.fieldKey))
    .map((column) => {
      const required = configured.get(column.fieldKey)?.requiredPublic ?? false;
      return { ...column, required, header: column.header.replace(/\[(Pflicht|Optional)\]$/, required ? "[Pflicht]" : "[Optional]") };
    });
}

export function getVisitorImportTemplateHeaders(definitions?: readonly PublicImportFieldDefinition[]): string[] {
  return getConfiguredTemplateColumns(definitions).map((column) => column.header);
}

export function getVisitorImportTemplateSampleRows(definitions?: readonly PublicImportFieldDefinition[]): string[][] {
  const columns = getConfiguredTemplateColumns(definitions);
  return [0, 1].map((sampleIndex) => columns.map((column) => column.samples[sampleIndex] ?? ""));
}

export function getVisitorImportTemplateSampleRowsForHeaders(headers: unknown[]): string[][] {
  const columnsByBaseHeader = new Map(
    visitorImportTemplateColumns.map((column) => [column.header.replace(/\s*\[(Pflicht|Optional)\]$/, ""), column])
  );
  return [0, 1].map((sampleIndex) => headers.map((header) => {
    const baseHeader = String(header ?? "").trim().replace(/\s*\[(Pflicht|Optional)\]$/, "");
    return columnsByBaseHeader.get(baseHeader)?.samples[sampleIndex] ?? "";
  }));
}

export function getVisitorImportExcelTemplateColumns(definitions?: readonly PublicImportFieldDefinition[]): ExcelImportTemplateColumn[] {
  return getConfiguredTemplateColumns(definitions);
}

export function getVisitorImportExcelTemplateHeaders(definitions?: readonly PublicImportFieldDefinition[]): string[] {
  return getVisitorImportTemplateHeaders(definitions);
}

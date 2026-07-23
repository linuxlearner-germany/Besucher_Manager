export type ImportVisitInput = {
  gateId?: string | null;
  gateName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
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
  rows: ImportVisitResult[];
};

type ImportTemplateColumn = {
  header: string;
  samples: [string, string];
};

export type ExcelImportTemplateColumn = ImportTemplateColumn & {
  section: "visitor" | "host" | "visit";
  required: boolean;
};

const visitorImportTemplateColumns: ExcelImportTemplateColumn[] = [
  { header: "Vorname [Pflicht]", samples: ["Max", "Erika"], section: "visitor", required: true },
  { header: "Nachname [Pflicht]", samples: ["Muster", "Sommer"], section: "visitor", required: true },
  { header: "Firma / Organisation [Pflicht]", samples: ["Musterfirma GmbH", "Nordwerk GmbH"], section: "visitor", required: true },
  { header: "Nationalität [Pflicht]", samples: ["Deutschland", "Deutschland"], section: "visitor", required: true },
  { header: "Geburtsdatum [Optional]", samples: ["15.04.1988", ""], section: "visitor", required: false },
  { header: "Telefon [Optional]", samples: ["+49 151 12345678", ""], section: "visitor", required: false },
  { header: "E-Mail [Optional]", samples: ["max.beispiel@musterfirma.de", ""], section: "visitor", required: false },
  { header: "Kennzeichen [Optional]", samples: ["B-MB 1234", ""], section: "visitor", required: false },
  { header: "Ausweisart [Pflicht]", samples: ["Personalausweis", "Reisepass"], section: "visitor", required: true },
  { header: "Ausweis gültig bis [Optional]", samples: ["31.12.2030", "01.09.2028"], section: "visitor", required: false },
  { header: "Ausweisnummer [Pflicht]", samples: ["L01X00ABC", "XK998877"], section: "visitor", required: true },
  { header: "Bemerkung [Optional]", samples: ["Lieferanteneinsatz am Vormittag", ""], section: "visitor", required: false },
  { header: "Ansprechpartner [Pflicht]", samples: ["Maria Muster", "Peter Sommer"], section: "host", required: true },
  { header: "Ansprechpartner Telefon [Pflicht]", samples: ["+49 30 123456", "+49 40 987654"], section: "host", required: true },
  { header: "Ansprechpartner E-Mail [Optional]", samples: ["maria.muster@wiweb.de", "peter.beispiel@wiweb.de"], section: "host", required: false },
  { header: "Abteilung / Bereich [Optional]", samples: ["Werksschutz", "IT"], section: "host", required: false },
  { header: "Besuchszweck [Pflicht]", samples: ["Projektbesprechung", "Kurztermin"], section: "visit", required: true },
  { header: "Gültig von [Pflicht]", samples: ["19.06.2026", "19.06.2026"], section: "visit", required: true },
  { header: "Gültig bis [Pflicht]", samples: ["19.06.2026", "19.06.2026"], section: "visit", required: true }
];

export function getVisitorImportTemplateHeaders(): string[] {
  return visitorImportTemplateColumns.map((column) => column.header);
}

export function getVisitorImportTemplateSampleRows(): string[][] {
  return [0, 1].map((sampleIndex) => visitorImportTemplateColumns.map((column) => column.samples[sampleIndex] ?? ""));
}

export function getVisitorImportExcelTemplateColumns(): ExcelImportTemplateColumn[] {
  return visitorImportTemplateColumns.map((column) => ({ ...column }));
}

export function getVisitorImportExcelTemplateHeaders(): string[] {
  return visitorImportTemplateColumns.map((column) => column.header);
}

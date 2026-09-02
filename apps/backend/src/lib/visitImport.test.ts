import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";

function loadVisitImportModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
  return require("./visitImport") as typeof import("./visitImport");
}

test("excel import preserves German dates as day-month-year", () => {
  const { normalizeImportDateOnly } = loadVisitImportModule();

  assert.equal(normalizeImportDateOnly("05.08.2026"), "2026-08-05");
  assert.equal(normalizeImportDateOnly("31.12.2030"), "2030-12-31");
  assert.equal(normalizeImportDateOnly("31.02.2026"), null);
  assert.equal(normalizeImportDateOnly("46247"), "2026-08-13");
});

test("simplified XLSX requires identity, visit data, gate and dates with Excel row numbers", () => {
  const { validateSimplifiedImportRows } = loadVisitImportModule();
  const requiredMessages = validateSimplifiedImportRows([{ sourceExcelRowNumber: 4, firstName: "", email: "" }]);
  assert.equal(requiredMessages.length, 8);
  assert.equal(requiredMessages.every((message) => message.includes("Excel-Zeile 4")), true);
  const messages = validateSimplifiedImportRows([{
    sourceExcelRowNumber: 7,
    gateName: "Hauptwache",
    firstName: "Erika",
    lastName: "Muster",
    company: "Beispiel GmbH",
    hostName: "Maria Muster",
    purpose: "Besprechung",
    email: "ungueltig",
    validFrom: "31.02.2026",
    validUntil: "01.09.2026"
  }]);
  assert.equal(messages.length, 2);
  assert.equal(messages.every((message) => message.includes("Excel-Zeile 7")), true);
});

test("simplified XLSX rejects an inactive or deleted gate", () => {
  const { validateSimplifiedImportRows } = loadVisitImportModule();
  const messages = validateSimplifiedImportRows([{
    sourceExcelRowNumber: 3,
    gateName: "Alte Wache",
    firstName: "Erika",
    lastName: "Muster",
    company: "Beispiel GmbH",
    hostName: "Maria Muster",
    purpose: "Besprechung",
    validFrom: "01.09.2026",
    validUntil: "01.09.2026"
  }], new Set(["hauptwache"]));
  assert.deepEqual(messages, ["Excel-Zeile 3: Wache ist nicht aktiv oder unbekannt."]);
});

test("visitor import template marks required and optional fields in headers", () => {
  const { getVisitorImportTemplateHeaders } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const headers = getVisitorImportTemplateHeaders();

  assert.equal(headers.includes("Vorname [Pflicht]"), true);
  assert.equal(headers.includes("Nachname [Pflicht]"), true);
  assert.equal(headers.includes("Firma / Organisation [Pflicht]"), true);
  assert.equal(headers.includes("Nationalität [Pflicht]"), true);
  assert.equal(headers.includes("Besuchszweck [Pflicht]"), true);
  assert.equal(headers.includes("Telefon [Optional]"), true);
  assert.equal(headers.includes("Ansprechpartner E-Mail [Optional]"), true);
  assert.equal(headers.includes("Straße [Pflicht]"), true);
  assert.equal(headers.includes("Hausnummer [Pflicht]"), true);
  assert.equal(headers.includes("PLZ [Pflicht]"), true);
  assert.equal(headers.includes("Ort [Pflicht]"), true);
});

test("excel template uses simplified grouped headers", () => {
  const { getVisitorImportExcelTemplateHeaders } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const headers = getVisitorImportExcelTemplateHeaders();

  assert.equal(headers.includes("Wache [Optional]"), false);
  assert.equal(headers.includes("GateId [Optional]"), false);
  assert.equal(headers.includes("Ausweisart [Pflicht]"), true);
  assert.equal(headers.includes("Ausweisnummer [Pflicht]"), true);
  assert.equal(headers.includes("Ansprechpartner Telefon [Pflicht]"), true);
});

test("excel template follows visible public fields and their required status", () => {
  const { getVisitorImportExcelTemplateHeaders } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const headers = getVisitorImportExcelTemplateHeaders([
    { fieldKey: "visitor_first_name", requiredPublic: true },
    { fieldKey: "visitor_email", requiredPublic: true },
    { fieldKey: "visitor_street", requiredPublic: false }
  ]);

  assert.deepEqual(headers, ["Vorname [Pflicht]", "Straße [Optional]", "E-Mail [Pflicht]"]);
});

test("excel rows use the same required and format validation as the public form", () => {
  const { validateImportedPreRegistrationRows } = require("./publicPreRegistrationSchema") as typeof import("./publicPreRegistrationSchema");
  const errors = validateImportedPreRegistrationRows([{
    sourceExcelRowNumber: 7,
    firstName: "Max",
    lastName: "Muster",
    company: "Beispiel GmbH",
    nationalityCode: "Deutschland",
    visitorStreet: "",
    visitorHouseNumber: "12",
    visitorPostalCode: "10115",
    visitorCity: "Berlin",
    hostName: "Maria Muster",
    hostPhone: "123",
    purpose: "Besprechung",
    validFrom: "19.06.2026",
    validUntil: "18.06.2026",
    idDocumentType: "Personalausweis",
    idDocumentValidUntil: "31.12.2030",
    idDocumentNumber: "A123",
    email: "ungueltig"
  }], new Set(["visitor_street", "valid_from", "valid_until"]));

  assert.equal(errors.some((message: string) => message.startsWith("Zeile 7:")), true);
  assert.equal(errors.some((message: string) => message.includes("Dieses Pflichtfeld ist erforderlich.")), true);
  assert.equal(errors.some((message: string) => message.includes("Ungültige E-Mail-Adresse.")), true);
  assert.equal(errors.some((message: string) => message.includes("Gültig bis darf nicht vor Gültig von liegen.")), true);
});

test("excel validation accepts German country names from the import template", () => {
  const { validateImportedPreRegistrationRows } = require("./publicPreRegistrationSchema") as typeof import("./publicPreRegistrationSchema");
  const errors = validateImportedPreRegistrationRows([{
    sourceExcelRowNumber: 2,
    firstName: "Max",
    lastName: "Muster",
    nationalityCode: "Deutschland"
  }], new Set(["visitor_first_name", "visitor_last_name", "visitor_nationality"]));

  assert.deepEqual(errors, []);
});

async function buildWorkbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Importvorlage");
  rows.forEach((row) => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function addDanglingCommentRelationship(buffer: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(buffer);
  archive.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDanglingComment" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments-missing.xml"/>
</Relationships>`
  );
  return archive.generateAsync({ type: "nodebuffer" });
}

test("excel import ignores a dangling comment relationship", async () => {
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const brokenWorkbook = await addDanglingCommentRelationship(await buildWorkbookBuffer([
    ["Vorname", "Nachname", "Firma", "Nationalität"],
    ["Max", "Muster", "Beispiel GmbH", "Deutschland"]
  ]));

  const unprotectedWorkbook = new ExcelJS.Workbook();
  await assert.rejects(
    () => unprotectedWorkbook.xlsx.load(brokenWorkbook as never),
    /reading 'comments'/
  );

  const parsed = await parseExcelBufferWithMetadata(brokenWorkbook);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.firstName, "Max");
  assert.equal(parsed.rows[0]?.lastName, "Muster");
  assert.equal(parsed.rows[0]?.company, "Beispiel GmbH");
  assert.equal(parsed.rows[0]?.nationalityCode, "Deutschland");
});

test("excel import ignores both unchanged template sample rows", async () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateSampleRows
  } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const headers = getVisitorImportTemplateHeaders();
  const sampleRows = getVisitorImportTemplateSampleRows();

  const parsed = await parseExcelBufferWithMetadata(await buildWorkbookBuffer([headers, ...sampleRows]));

  assert.deepEqual(parsed.rows, []);
  assert.equal(parsed.ignoredSampleRows, 2);
});

test("excel import ignores sample rows from a template with hidden fields", async () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateSampleRows
  } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const definitions = [
    { fieldKey: "visitor_first_name", requiredPublic: true },
    { fieldKey: "visitor_last_name", requiredPublic: true },
    { fieldKey: "visitor_nationality", requiredPublic: true }
  ];

  const parsed = await parseExcelBufferWithMetadata(await buildWorkbookBuffer([
    getVisitorImportTemplateHeaders(definitions),
    ...getVisitorImportTemplateSampleRows(definitions)
  ]));

  assert.deepEqual(parsed.rows, []);
  assert.equal(parsed.ignoredSampleRows, 2);
});

test("excel import treats an edited sample row as visitor data", async () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateSampleRows
  } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const [firstSample] = getVisitorImportTemplateSampleRows();
  const editedSample = [...firstSample];
  editedSample[0] = "Martin";

  const parsed = await parseExcelBufferWithMetadata(await buildWorkbookBuffer([
    getVisitorImportTemplateHeaders(),
    editedSample
  ]));

  assert.equal(parsed.ignoredSampleRows, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.firstName, "Martin");
  assert.equal(parsed.rows[0]?.lastName, "Muster");
  assert.equal(parsed.rows[0]?.sourceExcelRowNumber, 2);
});

test("excel import keeps original row numbers after skipping mixed sample rows", async () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateSampleRows
  } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const [firstSample, secondSample] = getVisitorImportTemplateSampleRows();
  const editedSample = [...secondSample];
  editedSample[2] = "Echte Firma GmbH";

  const parsed = await parseExcelBufferWithMetadata(await buildWorkbookBuffer([
    getVisitorImportTemplateHeaders(),
    firstSample,
    secondSample,
    editedSample
  ]));

  assert.equal(parsed.ignoredSampleRows, 2);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.company, "Echte Firma GmbH");
  assert.equal(parsed.rows[0]?.sourceExcelRowNumber, 4);
});

test("excel import does not ignore a sample row with additional unknown content", async () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateSampleRows
  } = require("./visitImportDefinitions") as typeof import("./visitImportDefinitions");
  const { parseExcelBufferWithMetadata } = require("./visitImportParsing") as typeof import("./visitImportParsing");
  const [firstSample] = getVisitorImportTemplateSampleRows();

  const parsed = await parseExcelBufferWithMetadata(await buildWorkbookBuffer([
    [...getVisitorImportTemplateHeaders(), "Zusatz"],
    [...firstSample, "bearbeitet"]
  ]));

  assert.equal(parsed.ignoredSampleRows, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.firstName, "Max");
  assert.equal(parsed.rows[0]?.sourceExcelRowNumber, 2);
});

test("country catalog contains all ISO 3166-1 entries and accepts codes or German names", () => {
  const { COUNTRIES, findCountryCode, normalizeCountryCode } = require("./countries") as typeof import("./countries");

  assert.equal(COUNTRIES.length, 249);
  assert.equal(new Set(COUNTRIES.map((country) => country.code)).size, 249);
  assert.equal(normalizeCountryCode("de"), "DE");
  assert.equal(findCountryCode("Deutschland"), "DE");
  assert.equal(findCountryCode("Unbekannt"), null);
});

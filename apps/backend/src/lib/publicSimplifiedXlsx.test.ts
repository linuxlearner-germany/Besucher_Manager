import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { SIMPLIFIED_XLSX_DATA_START_ROW, SIMPLIFIED_XLSX_HEADERS, buildSimplifiedImportTemplate } from "./simplifiedImportTemplate";
import type { GateSummary } from "./publicPreRegistrations";

process.env.APP_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.MSSQL_HOST ??= "localhost";
process.env.MSSQL_DATABASE ??= "test";
process.env.MSSQL_USER ??= "test";
process.env.MSSQL_PASSWORD ??= "test-password";

const activeGates: GateSummary[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Hauptwache", description: null, location: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "Nordtor", description: null, location: null }
];

async function workbookBuffer(formula = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Antrag");
  sheet.addRow(["Wache", "Gültig von", "Gültig bis"]);
  sheet.addRow(["Hauptwache", formula ? { formula: "TODAY()", result: 46000 } : "14.08.2026", "14.08.2026"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("public XLSX accepts a plain xlsx and enforces central limits", async () => {
  const { assertSafePublicXlsx, PUBLIC_XLSX_LIMITS } = await import("./publicSimplifiedXlsx.js");
  await assert.doesNotReject(assertSafePublicXlsx(await workbookBuffer()));
  assert.equal(PUBLIC_XLSX_LIMITS.maxBytes, 5 * 1024 * 1024);
  assert.equal(PUBLIC_XLSX_LIMITS.maxRows, 500);
  assert.equal(PUBLIC_XLSX_LIMITS.maxSheets, 3);
});

test("public XLSX rejects formulas", async () => {
  const { assertSafePublicXlsx, PublicXlsxError } = await import("./publicSimplifiedXlsx.js");
  await assert.rejects(assertSafePublicXlsx(await workbookBuffer(true)), (error: unknown) => error instanceof PublicXlsxError && error.code === "FORMULA_NOT_ALLOWED");
});

test("public XLSX rejects macro and external-link package parts", async () => {
  const { assertSafePublicXlsx, PublicXlsxError } = await import("./publicSimplifiedXlsx.js");
  const zip = await JSZip.loadAsync(await workbookBuffer());
  zip.file("xl/vbaProject.bin", "not-a-macro");
  await assert.rejects(assertSafePublicXlsx(await zip.generateAsync({ type: "nodebuffer" })), (error: unknown) => error instanceof PublicXlsxError && error.code === "UNSAFE_XLSX");
});

async function filledGeneratedTemplate(nationalities: readonly string[], gateName = "Hauptwache") {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSimplifiedImportTemplate(activeGates) as never);
  const sheet = workbook.getWorksheet("Vereinfachte Erfassung");
  assert.ok(sheet);
  nationalities.forEach((nationality, index) => {
    const row = sheet.getRow(SIMPLIFIED_XLSX_DATA_START_ROW + index);
    row.values = [gateName, `Vorname ${index + 1}`, `Nachname ${index + 1}`, "Musterfirma", nationality, "01.09.2026", "", "", "", "", "", "", "", "Montage", "01.09.2026", "30.09.2026", ""];
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function referenceValues(buffer: Buffer, columnNumber: number): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const references = workbook.getWorksheet("Referenzwerte");
  assert.ok(references);
  return (references.getColumn(columnNumber).values as unknown[])
    .slice(2)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

test("simplified XLSX template exposes parser-compatible headers and reference values", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSimplifiedImportTemplate(activeGates) as never);
  const sheet = workbook.getWorksheet("Vereinfachte Erfassung");
  const references = workbook.getWorksheet("Referenzwerte");
  assert.ok(sheet);
  assert.ok(references);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), [...SIMPLIFIED_XLSX_HEADERS]);
  assert.equal(SIMPLIFIED_XLSX_DATA_START_ROW, 2);
  const gateValidation = sheet.getCell("A2").dataValidation;
  assert.equal(gateValidation.formulae?.[0], "SimplifiedActiveGates");
  assert.notEqual(gateValidation.allowBlank, true);
  assert.equal(gateValidation.errorStyle, "stop");
  const nationalityValidation = sheet.getCell("E2").dataValidation;
  assert.equal(nationalityValidation.formulae?.[0], "SimplifiedNationalities");
  assert.equal(nationalityValidation.allowBlank, true);
  assert.equal(nationalityValidation.errorStyle, "stop");
  assert.match(nationalityValidation.prompt ?? "", /deutschen Ländernamen/);
  const nationalityReferences = (references.getColumn(1).values as unknown[]).slice(2);
  assert.equal(nationalityReferences.every((value) => typeof value === "string" && value.trim().length > 0), true);
  assert.equal(nationalityReferences.includes("Deutschland"), true);
  assert.equal(nationalityReferences.includes("Österreich"), true);
  assert.equal(nationalityReferences.includes("Vereinigte Staaten"), true);
  assert.equal(nationalityReferences.includes("DE"), false);
  assert.equal(nationalityReferences.includes("AT"), false);
  assert.equal(new Set(nationalityReferences).size, nationalityReferences.length);
  assert.deepEqual((references.getColumn(2).values as unknown[]).filter(Boolean).slice(1), ["Hauptwache", "Nordtor"]);
  assert.equal(references.state, "veryHidden");
});

test("simplified XLSX writes two non-overlapping validation ranges into worksheet XML", async () => {
  const zip = await JSZip.loadAsync(await buildSimplifiedImportTemplate(activeGates));
  const worksheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  assert.ok(worksheetXml);
  assert.ok(workbookXml);
  const validationRanges = [...worksheetXml.matchAll(/<dataValidation\b[^>]*\bsqref="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(validationRanges.sort(), ["A2:A501", "E2:E501"]);
  assert.match(worksheetXml, /<dataValidations count="2">/);
  assert.match(worksheetXml, /<formula1>SimplifiedActiveGates<\/formula1>/);
  assert.match(worksheetXml, /<formula1>SimplifiedNationalities<\/formula1>/);
  assert.match(workbookXml, /<sheet[^>]+name="Referenzwerte"[^>]+state="veryHidden"/);
});

test("each template download reflects added, reactivated, deactivated, and deleted gates", async () => {
  const initial = await buildSimplifiedImportTemplate([activeGates[0]!]);
  assert.deepEqual(await referenceValues(initial, 2), ["Hauptwache"]);

  const afterAddOrReactivate = await buildSimplifiedImportTemplate(activeGates);
  assert.deepEqual(await referenceValues(afterAddOrReactivate, 2), ["Hauptwache", "Nordtor"]);

  const afterDeactivateOrDelete = await buildSimplifiedImportTemplate([activeGates[0]!]);
  assert.deepEqual(await referenceValues(afterDeactivateOrDelete, 2), ["Hauptwache"]);
});

test("generated simplified XLSX template roundtrips through its import validation", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const result = await parseAndValidatePublicApplicationXlsx(await filledGeneratedTemplate(["Deutschland"]), activeGates);
  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.rowNumber, SIMPLIFIED_XLSX_DATA_START_ROW);
  assert.equal(result.rows[0]?.nationalityCode, "DE");
  assert.equal(result.rows[0]?.gateId, activeGates[0]?.id);
});

test("older offline XLSX files with ISO country codes remain server-compatible", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const result = await parseAndValidatePublicApplicationXlsx(await filledGeneratedTemplate(["DE", "AT", "US"]), activeGates);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows.map((row) => row.nationalityCode), ["DE", "AT", "US"]);
});

test("simplified XLSX accepts German country names offered by the template", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const result = await parseAndValidatePublicApplicationXlsx(await filledGeneratedTemplate(["Deutschland", "Österreich", "Vereinigte Staaten"]), activeGates);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows.map((row) => row.nationalityCode), ["DE", "AT", "US"]);
});

test("simplified XLSX validation errors include accepted country and active-gate examples", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const result = await parseAndValidatePublicApplicationXlsx(await filledGeneratedTemplate(["Atlantis"], "Geisterwache"), activeGates);
  assert.equal(result.valid, false);
  assert.match(result.rows[0]?.errors.join(" ") ?? "", /„DE“.*„Deutschland“/);
  assert.match(result.rows[0]?.errors.join(" ") ?? "", /„Hauptwache“.*„Nordtor“/);
});

test("preview rejects a gate from an older offline template after it was deactivated or deleted", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const oldOfflineFile = await filledGeneratedTemplate(["Deutschland"], "Nordtor");
  const result = await parseAndValidatePublicApplicationXlsx(oldOfflineFile, [activeGates[0]!]);
  assert.equal(result.valid, false);
  assert.equal(result.rows[0]?.gateId, null);
  assert.match(result.rows[0]?.errors.join(" ") ?? "", /Nordtor.*nicht aktiv oder unbekannt/);
});

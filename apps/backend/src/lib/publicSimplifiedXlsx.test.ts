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

test("simplified XLSX template exposes parser-compatible headers and reference values", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSimplifiedImportTemplate(activeGates) as never);
  const sheet = workbook.getWorksheet("Vereinfachte Erfassung");
  const references = workbook.getWorksheet("Referenzwerte");
  assert.ok(sheet);
  assert.ok(references);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), [...SIMPLIFIED_XLSX_HEADERS]);
  assert.equal(SIMPLIFIED_XLSX_DATA_START_ROW, 2);
  assert.equal(sheet.getCell("A2").dataValidation.formulae?.[0], "SimplifiedActiveGates");
  assert.equal(sheet.getCell("E2").dataValidation.formulae?.[0], "SimplifiedNationalities");
  assert.equal(references.getColumn(1).values.includes("Deutschland"), true);
  assert.equal(references.getColumn(1).values.includes("DE"), true);
  assert.deepEqual((references.getColumn(2).values as unknown[]).filter(Boolean).slice(1), ["Hauptwache", "Nordtor"]);
  assert.equal(references.state, "veryHidden");
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

test("generated simplified XLSX template accepts an ISO country code from its validation source", async () => {
  const { parseAndValidatePublicApplicationXlsx } = await import("./publicSimplifiedXlsx.js");
  const result = await parseAndValidatePublicApplicationXlsx(await filledGeneratedTemplate(["DE"]), activeGates);
  assert.equal(result.valid, true);
  assert.equal(result.rows[0]?.nationalityCode, "DE");
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

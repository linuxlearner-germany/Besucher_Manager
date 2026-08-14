import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";

process.env.APP_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.MSSQL_HOST ??= "localhost";
process.env.MSSQL_DATABASE ??= "test";
process.env.MSSQL_USER ??= "test";
process.env.MSSQL_PASSWORD ??= "test-password";

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

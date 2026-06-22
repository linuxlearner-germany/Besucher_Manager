import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

function loadVisitImportModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
  return require("./visitImport") as typeof import("./visitImport");
}

test("visitor import template marks required and optional fields in headers", () => {
  const { getVisitorImportTemplateHeaders } = loadVisitImportModule();
  const headers = getVisitorImportTemplateHeaders();

  assert.equal(headers.includes("Vorname [Pflicht]"), true);
  assert.equal(headers.includes("Nachname [Pflicht]"), true);
  assert.equal(headers.includes("Firma / Organisation [Pflicht]"), true);
  assert.equal(headers.includes("Besuchszweck [Pflicht]"), true);
  assert.equal(headers.includes("Telefon [Optional]"), true);
  assert.equal(headers.includes("Ansprechpartner E-Mail [Optional]"), true);
});

test("excel template uses simplified grouped headers", () => {
  const { getVisitorImportExcelTemplateHeaders } = loadVisitImportModule();
  const headers = getVisitorImportExcelTemplateHeaders();

  assert.equal(headers.includes("Wache [Optional]"), false);
  assert.equal(headers.includes("GateId [Optional]"), false);
  assert.equal(headers.includes("Ausweisart [Pflicht]"), true);
  assert.equal(headers.includes("Ausweisnummer [Pflicht]"), true);
  assert.equal(headers.includes("Ansprechpartner Telefon [Pflicht]"), true);
});

test("csv import accepts annotated template headers", () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateRows,
    parseCsvBuffer
  } = loadVisitImportModule();
  const headers = getVisitorImportTemplateHeaders();
  const [firstRow] = getVisitorImportTemplateRows();
  const csv = [headers.join(";"), firstRow.join(";")].join("\n");

  const rows = parseCsvBuffer(Buffer.from(csv, "utf8"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.gateName, "Hauptwache");
  assert.equal(rows[0]?.firstName, "Max");
  assert.equal(rows[0]?.lastName, "Beispiel");
  assert.equal(rows[0]?.company, "Musterfirma GmbH");
  assert.equal(rows[0]?.hostName, "Maria Muster");
  assert.equal(rows[0]?.purpose, "Projektbesprechung");
});

test("excel import accepts annotated template headers", () => {
  const {
    getVisitorImportTemplateHeaders,
    getVisitorImportTemplateRows,
    parseExcelBuffer
  } = loadVisitImportModule();
  const headers = getVisitorImportTemplateHeaders();
  const [firstRow] = getVisitorImportTemplateRows();
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, firstRow]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Importvorlage");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const rows = parseExcelBuffer(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.idDocumentType, "Personalausweis");
  assert.equal(rows[0]?.idDocumentValidUntil, "31.12.2030");
  assert.equal(rows[0]?.idDocumentNumber, "L01X00ABC");
  assert.equal(rows[0]?.notes, "Beispielimport mit vollständigen Daten");
});

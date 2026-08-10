import test from "node:test";
import assert from "node:assert/strict";

function loadGroupRegistrationModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";
  return require("./visitImport") as typeof import("./visitImport");
}

test("group registration preserves German dates as day-month-year", () => {
  const { normalizeImportDateOnly } = loadGroupRegistrationModule();

  assert.equal(normalizeImportDateOnly("05.08.2026"), "2026-08-05");
  assert.equal(normalizeImportDateOnly("31.12.2030"), "2030-12-31");
  assert.equal(normalizeImportDateOnly("31.02.2026"), null);
});

test("group rows use the public required-field and format validation", () => {
  const { validateImportedPreRegistrationRows } = require("./publicPreRegistrationSchema") as typeof import("./publicPreRegistrationSchema");
  const errors = validateImportedPreRegistrationRows([{
    sourceExcelRowNumber: 2,
    firstName: "Max",
    lastName: "Muster",
    visitorStreet: "",
    email: "ungueltig"
  }], new Set(["visitor_first_name", "visitor_last_name", "visitor_street"]));

  assert.equal(errors.some((message: string) => message.startsWith("Zeile 2:")), true);
  assert.equal(errors.some((message: string) => message.includes("Dieses Pflichtfeld ist erforderlich.")), true);
  assert.equal(errors.some((message: string) => message.includes("Ungültige E-Mail-Adresse.")), true);
});

test("country catalog contains all ISO entries and accepts codes or German names", () => {
  const { COUNTRIES, findCountryCode, normalizeCountryCode } = require("./countries") as typeof import("./countries");

  assert.equal(COUNTRIES.length, 249);
  assert.equal(new Set(COUNTRIES.map((country) => country.code)).size, 249);
  assert.equal(normalizeCountryCode("de"), "DE");
  assert.equal(findCountryCode("Deutschland"), "DE");
  assert.equal(findCountryCode("Unbekannt"), null);
});

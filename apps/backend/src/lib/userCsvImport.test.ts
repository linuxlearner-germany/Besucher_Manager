import test from "node:test";
import assert from "node:assert/strict";
import { buildUserImportTemplateCsv, parseUserImportCsv } from "./userCsvImport";

test("user csv template contains expected header order", () => {
  assert.equal(
    buildUserImportTemplateCsv().trim(),
    "username,password,role,displayName,email,groups,menuAccess,isActive"
  );
});

test("user csv parser supports comma and semicolon separated files", () => {
  const commaRows = parseUserImportCsv("username,password,role,email\nadmin,Secret123!,admin,admin@example.local\n");
  assert.equal(commaRows.length, 1);
  assert.equal(commaRows[0].username, "admin");
  assert.equal(commaRows[0].role, "admin");

  const semicolonRows = parseUserImportCsv("Benutzername;Passwort;Rolle;E-Mail\nwache;;guard;\n");
  assert.equal(semicolonRows.length, 1);
  assert.equal(semicolonRows[0].username, "wache");
  assert.equal(semicolonRows[0].role, "guard");
});

test("user csv parser rejects files without required headers", () => {
  assert.throws(() => parseUserImportCsv("foo,bar\n1,2\n"), /user_import_missing_headers/);
});

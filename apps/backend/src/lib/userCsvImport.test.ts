import test from "node:test";
import assert from "node:assert/strict";
import { buildUserExportCsv, buildUserImportTemplateCsv, parseUserImportCsv } from "./userCsvImport";

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

test("user csv export contains account data without passwords and escapes cells", () => {
  const csv = buildUserExportCsv([{
    username: "sibe.demo",
    role: "sibe",
    displayName: "SiBe, Demo",
    email: "sibe@example.local",
    gate: null,
    groups: ["Sicherheit", "Schicht A"],
    menuAccess: ["sibe"],
    isActive: true,
    lastLoginAt: "2026-07-23T10:00:00.000Z"
  }]);

  assert.match(csv, /^\uFEFFusername,role,displayName,email,gate,groups,menuAccess,isActive,lastLoginAt/);
  assert.match(csv, /"SiBe, Demo"/);
  assert.match(csv, /Sicherheit\|Schicht A/);
  assert.equal(csv.includes("password"), false);
});

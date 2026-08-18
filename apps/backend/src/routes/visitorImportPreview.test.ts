import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const visitorImport = readFileSync(resolve(__dirname, "visitorImport.ts"), "utf8");
const sibeRoutes = readFileSync(resolve(__dirname, "sibe.ts"), "utf8");
const apiRoutes = readFileSync(resolve(__dirname, "api.ts"), "utf8");

test("normal visitor import preview reparses and validates without importing", () => {
  const preview = visitorImport.slice(
    visitorImport.indexOf("export function handleVisitorImportPreview"),
    visitorImport.indexOf("export function handleVisitorImportUpload")
  );
  assert.match(visitorImport, /export function handleVisitorImportPreview/);
  assert.match(preview, /parseExcelBufferWithMetadata\(file\.buffer\)/);
  assert.match(preview, /validateImportedPreRegistrationRows\(rows, requiredPublicFieldKeys\)/);
  assert.doesNotMatch(preview, /createImportedPreRegistrations/);
});

test("internal normal visitor import preview and template retain the import permission", () => {
  assert.match(sibeRoutes, /\/api\/sibe\/visits\/import\/preview/);
  assert.match(sibeRoutes, /requirePermission\(request, response, "imports\.execute"\)/);
  assert.doesNotMatch(sibeRoutes, /const importRoles/);
});

test("public normal visitor import has separate CSRF, rate-limit, preview and safe XLSX routes", () => {
  assert.match(apiRoutes, /\/api\/public\/visits\/import\/preview/);
  assert.match(apiRoutes, /allowPublicVisitorImportRequest\(request, response, "preview", 12\)/);
  assert.match(apiRoutes, /requirePublicVisitorImportCsrf\(request, response\)/);
  assert.match(apiRoutes, /securePublicVisitorImportResponse\(response\)/);
  assert.match(apiRoutes, /handleVisitorImportPreview\(request, response, \{ validatePublicXlsx: true \}\)/);
  assert.match(apiRoutes, /handleVisitorImportUpload\(request, response, \{[\s\S]*?validatePublicXlsx: true/);
  assert.match(visitorImport, /await assertSafePublicXlsx\(file\.buffer\)/);
  assert.match(visitorImport, /source: "file_import"/);
});

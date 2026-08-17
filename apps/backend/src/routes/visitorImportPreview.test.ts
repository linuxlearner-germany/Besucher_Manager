import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const visitorImport = readFileSync(resolve(__dirname, "visitorImport.ts"), "utf8");
const sibeRoutes = readFileSync(resolve(__dirname, "sibe.ts"), "utf8");

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

test("normal visitor import preview and template use the import permission", () => {
  assert.match(sibeRoutes, /\/api\/sibe\/visits\/import\/preview/);
  assert.match(sibeRoutes, /requirePermission\(request, response, "imports\.execute"\)/);
  assert.doesNotMatch(sibeRoutes, /const importRoles/);
});

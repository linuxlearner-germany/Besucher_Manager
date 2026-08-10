import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const srcRoot = resolve(__dirname, "..");

test("visitor Excel-import endpoints, templates and parser are removed", () => {
  const apiSource = readFileSync(`${srcRoot}/routes/api.ts`, "utf8");
  const sibeSource = readFileSync(`${srcRoot}/routes/sibe.ts`, "utf8");

  assert.equal(existsSync(`${srcRoot}/routes/visitorImport.ts`), false);
  assert.equal(existsSync(`${srcRoot}/lib/visitImportParsing.ts`), false);
  assert.equal(existsSync(`${srcRoot}/lib/importTemplateFiles.ts`), false);
  assert.equal(apiSource.includes("/api/public/visits/import"), false);
  assert.equal(sibeSource.includes("/api/sibe/visits/import"), false);
  assert.equal(sibeSource.includes("import-template.xlsx"), false);
});

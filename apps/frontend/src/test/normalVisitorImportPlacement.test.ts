import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const srcRoot = resolve(process.cwd(), "src");
const publicPage = readFileSync(resolve(srcRoot, "pages/PublicPreRegistrationPage.tsx"), "utf8");
const importSection = readFileSync(resolve(srcRoot, "components/import/NormalVisitorImportSection.tsx"), "utf8");
const importCard = readFileSync(resolve(srcRoot, "components/import/ImportTemplateCard.tsx"), "utf8");
const core = readFileSync(resolve(srcRoot, "app/core.tsx"), "utf8");
const app = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");
const importPage = readFileSync(resolve(srcRoot, "pages/ImportPage.tsx"), "utf8");

describe("normal visitor XLSX import placement", () => {
  it("renders the normal importer at the bottom of the regular registration page", () => {
    expect(publicPage).toContain("NormalVisitorImportSection");
    expect(publicPage).toContain("canUseNormalVisitorImport(user)");
    expect(importSection).toContain("Besucher per XLSX importieren");
    expect(importSection).toContain("Alternativ können Sie mehrere Besucher gesammelt über eine XLSX-Datei importieren.");
    expect(importCard).toContain("Vorschau anzeigen");
    expect(importCard).toContain("Import ausführen");
    expect(importSection).toContain("/api/sibe/visits/import/preview");
    expect(importSection).toContain("/api/sibe/visits/import");
    expect(importSection).toContain("/api/sibe/visits/import-template.xlsx");
  });

  it("does not expose the normal importer as a navigation item or mix simplified import UI into it", () => {
    expect(core).not.toContain('{ to: "/import",');
    expect(core).not.toContain('label: "XLSX-Import"');
    expect(importPage).toContain("NormalVisitorImportSection");
    expect(importPage).not.toContain("canUseSimplifiedVisitPolicy");
  });

  it("keeps the direct legacy route guarded by the existing import permission", () => {
    const route = app.match(/path="\/import"[\s\S]*?<\/RequireRoles>/);
    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('requiredMenuKey="import"');
    expect(route?.[0]).toContain('requiredPermissions={["imports.execute"]}');
  });
});

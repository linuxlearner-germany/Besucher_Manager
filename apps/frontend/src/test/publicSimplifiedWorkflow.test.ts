import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicPage = readFileSync(resolve(process.cwd(), "src/pages/PublicSimplifiedApplicationPage.tsx"), "utf8");
const detailPage = readFileSync(resolve(process.cwd(), "src/pages/KaskdtApplicationDetailPage.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("public simplified XLSX workflow", () => {
  it("exposes download, preview and submit without an auth guard", () => {
    expect(publicPage).toContain("XLSX-Vorlage herunterladen");
    expect(publicPage).toContain("Datei prüfen und Vorschau anzeigen");
    expect(publicPage).toContain("Antrag verbindlich absenden");
    expect(app).toContain('path="/visit/simplified/application"');
  });

  it("keeps verification token in the fragment and capability header", () => {
    const verify = readFileSync(resolve(process.cwd(), "src/pages/PublicSimplifiedVerificationPage.tsx"), "utf8");
    expect(verify).toContain("window.location.hash.slice(1)");
    expect(verify).toContain("X-Application-Verification-Token");
  });

  it("supports individual, selected, bulk and explicit final decisions", () => {
    expect(detailPage).toContain("Auswahl genehmigen");
    expect(detailPage).toContain("Alle offenen Personen genehmigen");
    expect(detailPage).toContain("Alle offenen Personen ablehnen");
    expect(detailPage).toContain("Entscheidung abschließen und E-Mail senden");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicPage = readFileSync(resolve(process.cwd(), "src/pages/PublicSimplifiedApplicationPage.tsx"), "utf8");
const detailPage = readFileSync(resolve(process.cwd(), "src/pages/KaskdtApplicationDetailPage.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const core = readFileSync(resolve(process.cwd(), "src/app/core.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("public simplified XLSX workflow", () => {
  it("exposes download, preview and submit without an auth guard", () => {
    expect(publicPage).toContain("Vereinfachte Besucherregelung");
    expect(publicPage).toContain("XLSX-Vorlage herunterladen");
    expect(publicPage).toContain("Datei prüfen und Vorschau anzeigen");
    expect(publicPage).toContain("Antrag der vereinfachten Besucherregelung absenden");
    expect(app).toContain('path="/visit/simplified/application"');
  });

  it("shows only the intended public navigation and keeps related routes active", () => {
    expect(core).toContain('label: "Vereinfachte Besucherregelung", visible: !user');
    expect(core).toContain('activePrefixes: ["/visit/simplified/"]');
    expect(core).not.toContain('label: "XLSX-Antrag"');
    expect(core).toContain('label: "XLSX-Import", visible: Boolean(user &&');
  });

  it("uses a semantic stateful stepper and progressively reveals the workflow", () => {
    expect(publicPage).toContain('aria-current={state === "current" ? "step" : undefined}');
    expect(publicPage).toContain("Besucherdaten prüfen");
    expect(publicPage).toContain("Ihre Kontaktdaten");
    expect(publicPage).toContain("Antrag erfolgreich eingereicht");
    expect(publicPage).toContain("emailVerificationRequired");
    expect(publicPage).toContain("requireEmailVerification");
    expect(styles).toContain(".application-step-current");
    expect(styles).toContain("@media (max-width:760px)");
  });

  it("keeps file selection accessible and long names contained on mobile", () => {
    expect(publicPage).toContain('htmlFor="public-xlsx-file"');
    expect(publicPage).toContain('id="public-xlsx-file"');
    expect(publicPage).toContain('aria-live="polite"');
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain(".table-wrap");
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

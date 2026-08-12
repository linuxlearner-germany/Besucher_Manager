import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public pre-registration optional fields", () => {
  it("does not render required attributes or required-field messages", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/pages/PublicPreRegistrationPage.tsx"), "utf8");

    expect(source).not.toMatch(/\srequired(?:=|\s)/);
    expect(source).not.toContain("Pflichtfeld");
    expect(source).not.toContain("Bitte mindestens eine Besucherzeile ausfüllen");
    expect(source).toContain("Alle Angaben sind optional");
  });
});

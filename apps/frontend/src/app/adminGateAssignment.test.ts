import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("admin guard session gate", () => {
  it("does not send a persistent gate when a guard is created or updated", () => {
    const source = readFileSync(`${srcRoot}/pages/AdminPage.tsx`, "utf8");
    expect(source.match(/gateId: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain('adminUser.role === "guard" && !adminUser.gateId');
  });

  it("removes gate assignment controls from admin user forms", () => {
    const source = readFileSync(`${srcRoot}/components/admin/AdminSections.tsx`, "utf8");
    expect(source).not.toContain('label="Zugeordnete Wache"');
    expect(source).toContain("Wird bei Anmeldung gewählt");
  });
});

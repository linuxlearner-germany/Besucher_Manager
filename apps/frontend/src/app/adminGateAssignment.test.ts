import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("admin guard gate assignment", () => {
  it("sends the selected gate when a guard is created or updated", () => {
    const source = readFileSync(`${srcRoot}/pages/AdminPage.tsx`, "utf8");
    expect(source).toContain('gateId: newUser.role === "guard" ? newUser.gateId || null : null');
    expect(source).toContain('gateId: adminUser.role === "guard" ? adminUser.gateId || null : null');
    expect(source).toContain('adminUser.role === "guard" && !adminUser.gateId');
  });

  it("offers active gates in both admin user forms", () => {
    const source = readFileSync(`${srcRoot}/components/admin/AdminSections.tsx`, "utf8");
    expect(source.match(/label="Zugeordnete Wache"/g)).toHaveLength(2);
    expect(source).toContain('gates.filter((gate) => gate.isActive)');
    expect(source).toContain('gate.isActive || gate.id === selectedUser.gateId');
  });
});

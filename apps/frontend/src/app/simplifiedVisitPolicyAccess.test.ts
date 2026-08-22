import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("simplified visit policy access", () => {
  it("guards the direct manual-entry route for SiBe only", () => {
    const source = readFileSync(`${srcRoot}/App.tsx`, "utf8");
    const route = source.match(/path="\/sibe\/besucher\/vereinfacht"[\s\S]*?<\/RequireRoles>/);
    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('allowedRoles={["sibe"]}');
    expect(route?.[0]).not.toContain('"admin"');
  });

  it("shows the dedicated navigation entry through the SiBe-only helper", () => {
    const source = readFileSync(`${srcRoot}/app/core.tsx`, "utf8");
    expect(source).toContain('return user?.role === "sibe";');
    expect(source).toContain('label: "Vereinfachte Besuchsregelung", visible: canUseSimplifiedVisitPolicy(user)');
  });

  it("keeps the simplified visit flow on the manual entry page", () => {
    const importSource = readFileSync(`${srcRoot}/pages/ImportPage.tsx`, "utf8");
    const entrySource = readFileSync(`${srcRoot}/pages/SibeSimplifiedEntryPage.tsx`, "utf8");
    expect(importSource).not.toContain("SimplifiedRule");
    expect(entrySource).not.toContain('to="/import"');
  });
});

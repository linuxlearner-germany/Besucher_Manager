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

  it("renders the PDF policy input only for SiBe", () => {
    const source = readFileSync(`${srcRoot}/pages/ImportPage.tsx`, "utf8");
    expect(source).toContain('user?.role === "sibe" ? <section className="panel import-card">');
  });
});

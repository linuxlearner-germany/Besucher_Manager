import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("simplified SiBe entry", () => {
  it("uses a dedicated SiBe-only route and exposes the action in the SiBe visitor area", () => {
    const appSource = readFileSync(`${srcRoot}/App.tsx`, "utf8");
    const visitorsSource = readFileSync(`${srcRoot}/pages/SibeVisitorsPage.tsx`, "utf8");
    const formSource = readFileSync(`${srcRoot}/pages/SibeSimplifiedEntryPage.tsx`, "utf8");

    expect(appSource).toContain('path="/sibe/besucher/vereinfacht"');
    expect(appSource).toContain('allowedRoles={["sibe"]}');
    expect(appSource).not.toContain('allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" requiredPermissions={["visits.create"]}');
    expect(visitorsSource).toContain("Besucher vereinfacht erfassen");
    expect(formSource).toContain('label="Wache" required');
    expect(formSource).toContain('label="Gültig von" required');
    expect(formSource).toContain('label="Gültig bis" required');
    expect(formSource).toContain('label="Vorname" error=');
    expect(formSource).not.toContain('label="Vorname" required');
    expect(formSource).not.toContain('label="Nachname" required');
  });
});

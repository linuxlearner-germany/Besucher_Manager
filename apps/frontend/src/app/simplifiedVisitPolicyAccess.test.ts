import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("simplified visit policy access", () => {
  it("registers the direct route with a SiBe-only route guard", () => {
    const appSource = readFileSync(`${srcRoot}/App.tsx`, "utf8");
    const route = appSource.match(/path="\/sibe\/vereinfachte-besuchsregelung"[\s\S]*?<\/RequireRoles>/);

    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('allowedRoles={["sibe"]}');
    expect(route?.[0]).not.toContain('"admin"');
    expect(route?.[0]).not.toContain('"guard"');
    expect(route?.[0]).not.toContain('"kaskdt"');
    expect(route?.[0]).not.toContain('"custom"');
  });

  it("shows the navigation entry only through the SiBe role helper", () => {
    const coreSource = readFileSync(`${srcRoot}/app/core.tsx`, "utf8");
    const navigationEntry = coreSource.match(/\{ to: "\/sibe\/vereinfachte-besuchsregelung"[^\n]+/);

    expect(navigationEntry).not.toBeNull();
    expect(navigationEntry?.[0]).toContain('label: "Vereinfachte Besuchsregelung"');
    expect(navigationEntry?.[0]).toContain("visible: canUseSimplifiedSibeRegistration(user)");
  });
});

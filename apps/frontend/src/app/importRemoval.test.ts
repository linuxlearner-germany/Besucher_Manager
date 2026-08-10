import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

describe("visitor Excel import removal", () => {
  it("removes the import page, route and navigation entry", () => {
    const appSource = readFileSync(`${srcRoot}/App.tsx`, "utf8");
    const coreSource = readFileSync(`${srcRoot}/app/core.tsx`, "utf8");

    expect(existsSync(`${srcRoot}/pages/ImportPage.tsx`)).toBe(false);
    expect(appSource).not.toContain('path="/import"');
    expect(coreSource).not.toContain('to: "/import"');
    expect(coreSource).not.toContain('label: "Import"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public confirmation responsive styles", () => {
  it("uses one-column mobile layouts, full-width actions and safe long-text wrapping", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 700px)"), styles.indexOf("@media (max-width: 430px)"));

    expect(mobile).toContain(".public-confirmation-form-grid { grid-template-columns: 1fr; }");
    expect(mobile).toContain(".public-confirmation-actions button { width: 100%; min-width: 0; }");
    expect(styles).toContain("overflow-wrap: anywhere;");
    expect(styles).toContain("min-width: 0;");
    expect(styles).toContain("min-height: 46px;");
  });
});

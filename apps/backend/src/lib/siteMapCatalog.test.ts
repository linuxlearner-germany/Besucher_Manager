import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listSiteMapCatalog, selectSiteMapCatalogEntry } from "./siteMapCatalog";

test("site map catalog lists supported files and ignores unsafe or unrelated entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "site-map-catalog-"));
  await fs.writeFile(path.join(root, "plan.svg"), "<svg />", "utf8");
  await fs.writeFile(path.join(root, "plan.png"), "image", "utf8");
  await fs.writeFile(path.join(root, ".gitkeep"), "", "utf8");
  await fs.mkdir(path.join(root, "nested"));

  try {
    const entries = await listSiteMapCatalog(null, root);
    assert.deepEqual(entries.map((entry) => entry.fileName), ["plan.png", "plan.svg"]);
    assert.equal(entries[0]?.isActive, true);
    assert.equal(entries.find((entry) => entry.fileName === "plan.svg")?.mimeType, "image/svg+xml");
    assert.equal(selectSiteMapCatalogEntry(entries, "plan.svg")?.fileName, "plan.svg");
    assert.equal(selectSiteMapCatalogEntry(entries, "missing.png")?.fileName, "plan.png");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

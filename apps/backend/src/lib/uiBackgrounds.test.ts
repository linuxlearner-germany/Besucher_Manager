import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listUiBackgrounds,
  parseUiBackgroundCatalog,
  selectConfiguredUiBackground,
  type UiBackground
} from "./uiBackgrounds";

const validCatalog = {
  version: 1,
  backgrounds: [
    {
      id: "standard",
      name: "Standard",
      fileName: "standard.png",
      previewFileName: "standard.webp",
      width: 1920,
      height: 1080
    },
    {
      id: "alternative",
      name: "Alternative",
      fileName: "alternative.jpg",
      previewFileName: "alternative.webp",
      width: 1920,
      height: 1080
    }
  ]
} as const;

test("background catalog accepts safe unique entries", () => {
  const entries = parseUiBackgroundCatalog(validCatalog);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.id, "standard");
});

test("background catalog rejects unsafe file names and duplicate ids", () => {
  assert.throws(() => parseUiBackgroundCatalog({
    version: 1,
    backgrounds: [
      validCatalog.backgrounds[0],
      {
        ...validCatalog.backgrounds[1],
        id: "standard",
        fileName: "../secret.png"
      }
    ]
  }));
});

test("background listing skips missing originals and falls back to the original for missing previews", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-backgrounds-"));
  await fs.mkdir(path.join(root, "catalog"), { recursive: true });
  await fs.mkdir(path.join(root, "previews"), { recursive: true });
  await fs.writeFile(path.join(root, "backgrounds.json"), JSON.stringify(validCatalog), "utf8");
  await fs.writeFile(path.join(root, "catalog", "standard.png"), "image", "utf8");

  try {
    const backgrounds = await listUiBackgrounds(root);
    assert.equal(backgrounds.length, 1);
    assert.equal(backgrounds[0]?.id, "standard");
    assert.equal(backgrounds[0]?.previewUrl, backgrounds[0]?.imageUrl);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("configured background selection is stable and falls back to standard", () => {
  const backgrounds: UiBackground[] = validCatalog.backgrounds.map((entry, index) => ({
    ...entry,
    imageUrl: `/image-${index}`,
    previewUrl: `/preview-${index}`,
    fileSizeBytes: 100 + index
  }));

  assert.equal(selectConfiguredUiBackground(backgrounds, "alternative")?.id, "alternative");
  assert.equal(selectConfiguredUiBackground(backgrounds, "missing")?.id, "standard");
  assert.equal(selectConfiguredUiBackground(backgrounds, null, null, "alternative.jpg")?.id, "alternative");
});

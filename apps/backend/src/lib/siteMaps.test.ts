import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStoredSiteMapFileName,
  getNormalizedExtension,
  isAllowedSiteMapExtension,
  isAllowedSiteMapMimeType
} from "./siteMaps";

test("site map upload validation only allows expected mime types", () => {
  assert.equal(isAllowedSiteMapMimeType("image/png"), true);
  assert.equal(isAllowedSiteMapMimeType("image/jpeg"), true);
  assert.equal(isAllowedSiteMapMimeType("image/webp"), true);
  assert.equal(isAllowedSiteMapMimeType("image/svg+xml"), false);
  assert.equal(isAllowedSiteMapMimeType("application/pdf"), false);
});

test("site map upload validation normalizes and restricts extensions", () => {
  assert.equal(getNormalizedExtension("plan.png"), ".png");
  assert.equal(getNormalizedExtension("plan.JPEG"), ".jpg");
  assert.equal(getNormalizedExtension("plan"), null);
  assert.equal(isAllowedSiteMapExtension(".png"), true);
  assert.equal(isAllowedSiteMapExtension(".jpeg"), true);
  assert.equal(isAllowedSiteMapExtension(".svg"), false);
});

test("stored site map file names never reuse the original name", () => {
  const stored = buildStoredSiteMapFileName(".png");
  assert.match(stored, /^site-map-\d{13}-[0-9a-f-]{36}\.png$/);
  assert.equal(stored.includes("plan"), false);
});

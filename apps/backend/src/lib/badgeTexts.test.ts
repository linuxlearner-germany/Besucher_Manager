import test from "node:test";
import assert from "node:assert/strict";
import {
  getBadgeTextHeading,
  getBadgeTextSectionLabel,
  getDefaultBadgeTextSortOrder,
  isBadgeTextSectionType,
  toBadgeTextResponseRecord
} from "./badgeTexts";

test("recognizes supported badge text section types", () => {
  assert.equal(isBadgeTextSectionType("security_notice"), true);
  assert.equal(isBadgeTextSectionType("custom"), true);
  assert.equal(isBadgeTextSectionType("unknown"), false);
});

test("uses custom heading only for custom sections", () => {
  assert.equal(getBadgeTextHeading("custom", "Verhalten im Brandfall"), "Verhalten im Brandfall");
  assert.equal(getBadgeTextHeading("photo_ban", "Ignorieren"), "Fotografierverbot");
});

test("maps labels and sort orders for responses", () => {
  const payload = toBadgeTextResponseRecord({
    id: "1",
    name: "Verhalten im Brandfall",
    sectionType: "custom",
    customHeading: "Verhalten im Brandfall",
    content: "Beispiel",
    isActive: true,
    sortOrder: 110
  });

  assert.equal(payload.sectionLabel, "Benutzerdefiniert");
  assert.equal(payload.heading, "Verhalten im Brandfall");
  assert.equal(getBadgeTextSectionLabel("signature_notice"), "Rückgabe und Unterschrift");
  assert.equal(getDefaultBadgeTextSortOrder("footer"), 50);
});

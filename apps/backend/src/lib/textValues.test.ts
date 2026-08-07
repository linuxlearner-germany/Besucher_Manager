import test from "node:test";
import assert from "node:assert/strict";
import { cleanOptional, cleanRequired, isBlankOrPlaceholder } from "./textValues";

test("normalizes optional and required text values consistently", () => {
  assert.equal(cleanOptional("  Besucher  "), "Besucher");
  assert.equal(cleanOptional("  "), null);
  assert.equal(cleanRequired(null, "[fehlt]"), "[fehlt]");
});

test("recognizes blank import placeholders case-insensitively", () => {
  assert.equal(isBlankOrPlaceholder(" [FEHLT] ", "[fehlt]"), true);
  assert.equal(isBlankOrPlaceholder("Muster GmbH", "[fehlt]"), false);
});

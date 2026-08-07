import test from "node:test";
import assert from "node:assert/strict";
import { dateOnlyEnd, dateOnlyStart, isIsoDateOnly } from "./dateOnly";

test("date-only boundaries preserve the complete UTC day", () => {
  assert.equal(dateOnlyStart("2026-07-30").toISOString(), "2026-07-30T00:00:00.000Z");
  assert.equal(dateOnlyEnd("2026-07-30").toISOString(), "2026-07-30T23:59:59.999Z");
});

test("recognizes ISO date-only strings", () => {
  assert.equal(isIsoDateOnly("2026-07-30"), true);
  assert.equal(isIsoDateOnly(" 2026-07-30 "), true);
  assert.equal(isIsoDateOnly("30.07.2026"), false);
});

test("date-only helpers do not shift a calendar date across time zones", () => {
  assert.equal(dateOnlyStart("2030-12-31").getUTCDate(), 31);
  assert.equal(dateOnlyEnd("2030-12-31").getUTCHours(), 23);
});

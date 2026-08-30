import assert from "node:assert/strict";
import test from "node:test";
import { utcDateTimeJsonReplacer } from "./utcDateTimeJson";

test("marks timezone-less SQL datetime strings as UTC in JSON responses", () => {
  const serialized = JSON.parse(JSON.stringify({
    checkInAt: "2026-08-30T19:23:00.1234567",
    checkOutAt: "2026-08-30T20:45:00",
    alreadyUtc: "2026-08-30T19:23:00.000Z",
    explicitOffset: "2026-08-30T21:23:00.000+02:00",
    dateOnly: "2026-08-30",
    expectedArrivalTime: "19:23",
    note: "Termin 2026-08-30T19:23:00 ohne technische Bedeutung"
  }, utcDateTimeJsonReplacer)) as Record<string, string>;

  assert.equal(serialized.checkInAt, "2026-08-30T19:23:00.1234567Z");
  assert.equal(serialized.checkOutAt, "2026-08-30T20:45:00Z");
  assert.equal(serialized.alreadyUtc, "2026-08-30T19:23:00.000Z");
  assert.equal(serialized.explicitOffset, "2026-08-30T21:23:00.000+02:00");
  assert.equal(serialized.dateOnly, "2026-08-30");
  assert.equal(serialized.expectedArrivalTime, "19:23");
  assert.equal(serialized.note, "Termin 2026-08-30T19:23:00 ohne technische Bedeutung");
  assert.equal(new Date(serialized.checkInAt).toISOString(), "2026-08-30T19:23:00.123Z");
});

test("keeps Date values as the native UTC JSON representation", () => {
  const serialized = JSON.parse(JSON.stringify({
    timestamp: new Date("2026-08-30T19:23:00.000Z")
  }, utcDateTimeJsonReplacer)) as { timestamp: string };

  assert.equal(serialized.timestamp, "2026-08-30T19:23:00.000Z");
});

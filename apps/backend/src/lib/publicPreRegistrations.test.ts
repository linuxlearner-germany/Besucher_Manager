import test from "node:test";
import assert from "node:assert/strict";
import { generateBadgeNumberCandidate } from "./badgeNumber";

test("badge number candidate uses exactly 5 uppercase alphanumeric characters", () => {
  const pattern = /^[A-Z0-9]{5}$/;

  for (let index = 0; index < 200; index += 1) {
    const candidate = generateBadgeNumberCandidate();
    assert.equal(candidate.length, 5);
    assert.equal(pattern.test(candidate), true);
    assert.equal(candidate.includes("-"), false);
    assert.equal(candidate.startsWith("B-"), false);
    assert.equal(candidate.includes("LEGACY"), false);
  }
});

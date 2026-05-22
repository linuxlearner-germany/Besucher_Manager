import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "./rateLimit";

test("rate limit allows requests up to the configured limit", () => {
  const key = `test-key-${Date.now()}-allow`;

  const first = checkRateLimit(key, 2, 60);
  const second = checkRateLimit(key, 2, 60);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
});

test("rate limit blocks requests over the configured limit", () => {
  const key = `test-key-${Date.now()}-block`;

  checkRateLimit(key, 1, 60);
  const blocked = checkRateLimit(key, 1, 60);

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

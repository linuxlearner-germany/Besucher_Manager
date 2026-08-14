import assert from "node:assert/strict";
import test from "node:test";
import { parseRedactedLogJson, redactLogValue, redactSensitiveText } from "./logRedaction";

test("log metadata redacts nested secrets without removing useful context", () => {
  assert.deepEqual(redactLogValue({
    action: "VISIT_CHECKED_IN",
    password: "unsafe",
    nested: { accessToken: "token-value", requestId: "request-1" },
    headers: { Authorization: "Bearer abc.def", Cookie: "session=unsafe" }
  }), {
    action: "VISIT_CHECKED_IN",
    password: "[REDACTED]",
    nested: { accessToken: "[REDACTED]", requestId: "request-1" },
    headers: { Authorization: "[REDACTED]", Cookie: "[REDACTED]" }
  });
});

test("free text and invalid JSON redact credential-shaped values", () => {
  assert.equal(redactSensitiveText("Authorization: Bearer abc.def password=hunter2"), "Authorization=[REDACTED] password=[REDACTED]");
  assert.equal(parseRedactedLogJson("api_key=unsafe source=legacy"), "api_key=[REDACTED] source=legacy");
});

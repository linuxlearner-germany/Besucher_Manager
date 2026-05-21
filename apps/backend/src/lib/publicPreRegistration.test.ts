import test from "node:test";
import assert from "node:assert/strict";
import { publicPreRegistrationSchema } from "./publicPreRegistrationSchema";

test("public pre-registration requires validUntil after validFrom", () => {
  const result = publicPreRegistrationSchema.safeParse({
    firstName: "Max",
    lastName: "Mustermann",
    company: "Test GmbH",
    hostName: "Sabine Keller",
    hostDepartment: "Produktion",
    purpose: "Besprechung",
    gateId: "11111111-1111-1111-1111-111111111111",
    validFrom: "2026-05-21T10:00:00.000Z",
    validUntil: "2026-05-21T09:00:00.000Z"
  });

  assert.equal(result.success, false);
});

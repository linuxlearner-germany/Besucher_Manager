import test from "node:test";
import assert from "node:assert/strict";
import { simplifiedSibeVisitorSchema } from "./simplifiedSibeRegistrationSchema";

test("simplified visitor registration accepts minimal visitor data", () => {
  const parsed = simplifiedSibeVisitorSchema.safeParse({ firstName: "Erika", lastName: "Muster" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.company, "");
    assert.equal(parsed.data.nationalityCode, null);
  }
});

test("simplified SiBe registration still requires a person's name", () => {
  assert.equal(simplifiedSibeVisitorSchema.safeParse({ firstName: "", lastName: "" }).success, false);
});

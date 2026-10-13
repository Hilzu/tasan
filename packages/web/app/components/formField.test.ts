import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateExpression, parseNumber } from "~/components/formField";

await test("parseNumber leniently parses numbers", () => {
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("€ 1 234,5"), 1234.5);
  assert.equal(parseNumber("abc"), 0);
});

await test("evaluateExpression evaluates arithmetic expressions", () => {
  assert.equal(evaluateExpression("12.5"), 12.5);
  assert.equal(evaluateExpression(" 10 + 2,5 * (4 - 2) / 5 "), 11);
  assert.equal(evaluateExpression("1 +"), undefined);
  assert.equal(evaluateExpression("1 / 0"), undefined);
  assert.equal(evaluateExpression("alert(1)"), undefined);
});

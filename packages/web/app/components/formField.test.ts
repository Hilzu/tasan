import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateExpression,
  parseNumber,
  resolveAmount,
} from "~/components/formField";

await test("empty amounts stay automatic", () => {
  for (const expressionMode of [false, true]) {
    assert.equal(resolveAmount("", expressionMode, 2), undefined);
    assert.equal(resolveAmount("  ", expressionMode, 0), undefined);
  }
});

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
  assert.equal(evaluateExpression("2 + 3 * 4 - 6 / 2"), 11);
  assert.equal(evaluateExpression("10 - 2 - 3"), 5);
  assert.equal(evaluateExpression("-(1,5 + .5) * -2"), 4);
  assert.equal(evaluateExpression("7,"), 7);
  assert.equal(evaluateExpression(""), undefined);
  assert.equal(evaluateExpression("(1 + 2"), undefined);
  assert.equal(evaluateExpression("1 + 2)"), undefined);
  assert.equal(evaluateExpression("1 2"), undefined);
  assert.equal(evaluateExpression("1.2.3"), undefined);
  assert.equal(evaluateExpression("(".repeat(100_000) + "1"), undefined);
});

await test("resolveAmount rounds only the final result", () => {
  assert.deepEqual(resolveAmount("1 / 3 * 3", true, 2), {
    value: 1,
    fractions: 2,
  });
  assert.deepEqual(resolveAmount("10 / 3", true, 2), {
    value: 3.33,
    fractions: 2,
  });
  assert.deepEqual(resolveAmount("100 / 3", true, 0), {
    value: 33,
    fractions: 0,
  });
});

await test("resolveAmount keeps invalid calculations unresolved", () => {
  for (const input of ["1 +", "1 / 0", "(2", "abc", ""])
    assert.equal(resolveAmount(input, true, 2), undefined, input);
  assert.deepEqual(resolveAmount("€ 12,5", false, 2), {
    value: 12.5,
    fractions: 2,
  });
});

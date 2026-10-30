import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";

await test("decimal rational conversion preserves decimal digits and exponent notation", () => {
  for (const [value, numerator, denominator] of [
    [0, 0n, 1n],
    [0.00565, 565n, 100000n],
    [-1.005, -1005n, 1000n],
    [5e-7, 5n, 10000000n],
    [1.25e-7, 125n, 1000000000n],
    [1.25e21, 1250000000000000000000n, 1n],
  ] as const) {
    assert.deepEqual(D.toRational(value), { numerator, denominator });
  }
  assert.deepEqual(D.toRational(D.create(0.03)), {
    numerator: 3n,
    denominator: 100n,
  });
});

await test("decimal rational conversion rejects non-finite values", () => {
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(() => D.toRational(value), RangeError);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "./exchange-rate.js";

await test("rates canonicalize decimal scales and keep provider digits exactly", () => {
  assert.equal(Rate.create("1.00500"), "1.005");
  assert.equal(Rate.create("0.000054733"), "0.000054733");
  assert.equal(Rate.create(String(0.1 + 0.2)), "0.30000000000000004");
  assert.equal(Rate.create("0.000001"), "0.000001");
  assert.equal(Rate.create("1000000"), "1000000");
});

await test("rates stay within one millionth to one million and JS number precision", () => {
  for (const text of [
    "0",
    "-1",
    "NaN",
    "",
    "1e-7",
    "0.0000009",
    "1000000.1",
    "0.12345678901234567890",
  ])
    assert.throws(() => Rate.create(text), RangeError, text);
});

await test("reciprocal display rounds half units away from zero at explicit precision", () => {
  assert.equal(Rate.reciprocal(Rate.create("3"), 5), "0.33333");
  assert.equal(Rate.reciprocal(Rate.create("8"), 2), "0.13");
  assert.equal(Rate.reciprocal(Rate.create("2"), 0), "1");
  for (const precision of [-1, 39, 0.5, NaN])
    assert.throws(
      () => Rate.reciprocal(Rate.create("3"), precision),
      RangeError,
    );
});

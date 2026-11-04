import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "./exchange-rate.js";

await test("rates canonicalize equivalent decimal scales without losing published digits", () => {
  assert.equal(Rate.create("1.00500"), Rate.create("1005e-3"));
  assert.equal(Rate.create("1.25e-7"), "0.000000125");
  assert.equal(
    Rate.create("0.12345678901234567890123456789012345678"),
    "0.12345678901234567890123456789012345678",
  );
});

await test("rates enforce positivity and storage precision and magnitude limits", () => {
  assert.equal(Rate.create("1e-130"), `0.${"0".repeat(129)}1`);
  assert.equal(
    Rate.create(`${"9".repeat(38)}e88`),
    `${"9".repeat(38)}${"0".repeat(88)}`,
  );
  for (const text of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "",
    "1e126",
    "1e-131",
    "0.123456789012345678901234567890123456789",
  ])
    assert.throws(() => Rate.create(text), RangeError);
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

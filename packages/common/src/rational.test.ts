import assert from "node:assert/strict";
import { test } from "node:test";

import * as R from "./rational.js";

await test("rational arithmetic reduces fractions and normalizes denominator signs", () => {
  assert.deepEqual(R.rational(6n, -8n), { numerator: -3n, denominator: 4n });
  assert.deepEqual(R.rational(0n, -7n), { numerator: 0n, denominator: 1n });
  const third = R.rational(1n, 3n);
  const sixth = R.rational(1n, 6n);
  assert.deepEqual(R.add(third, sixth), R.rational(1n, 2n));
  assert.deepEqual(R.subtract(third, sixth), sixth);
  assert.deepEqual(R.multiply(third, R.rational(3n)), R.rational(1n));
  assert.deepEqual(R.divide(third, sixth), R.rational(2n));
  assert.deepEqual(R.negate(third), R.rational(-1n, 3n));
  assert.throws(() => R.rational(1n, 0n), RangeError);
  assert.throws(() => R.divide(third, R.rational(0n)), RangeError);
});

await test("decimal parsing preserves exact values across decimal and exponent notation", () => {
  assert.deepEqual(R.parse(".125"), R.rational(1n, 8n));
  assert.deepEqual(R.parse("1.25e-7"), R.rational(1n, 8_000_000n));
  assert.deepEqual(R.parse(" -12.50E+2 "), R.rational(-1250n));
  assert.deepEqual(R.parse("+0.000"), R.rational(0n));
  for (const text of ["", "NaN", "Infinity", "1/3", "1.2.3", "1e", "--1"])
    assert.throws(() => R.parse(text), RangeError);
});

await test("signed rounding and decimal formatting retain exact units", () => {
  for (const [value, expected] of [
    ["1.5", 2n],
    ["-1.5", -2n],
    ["1.499", 1n],
    ["-1.499", -1n],
  ] as const)
    assert.equal(R.round(R.parse(value)), expected);
  assert.equal(R.fixed(-1n, 2), "-0.01");
  assert.equal(R.fixed(900719925474099301n, 2), "9007199254740993.01");
  assert.equal(R.decimalText(R.rational(1n, 40n)), "0.025");
  assert.equal(R.storageDecimal("001.00500"), "1.005");
  assert.throws(() => R.decimalText(R.rational(1n, 3n)), RangeError);
});

await test("largest remainders conserve signed totals with stable ties", () => {
  assert.deepEqual(
    R.allocate(
      2n,
      Array.from({ length: 3 }, () => R.rational(2n, 3n)),
    ),
    [1n, 1n, 0n],
  );
  assert.deepEqual(
    R.allocate(
      -2n,
      Array.from({ length: 3 }, () => R.rational(-2n, 3n)),
    ),
    [0n, -1n, -1n],
  );
  assert.deepEqual(
    R.allocate(1n, [R.rational(4999n, 10000n), R.rational(5001n, 10000n)]),
    [0n, 1n],
  );
  assert.deepEqual(R.allocate(1n, [R.rational(-1n, 2n), R.rational(3n, 2n)]), [
    0n,
    1n,
  ]);
  assert.deepEqual(R.allocate(0n, []), []);
  assert.throws(() => R.allocate(0n, [R.rational(1n)]), RangeError);
  assert.throws(() => R.allocate(2n, []), RangeError);
});

await test("expressions honor precedence, parentheses and unary signs without intermediate rounding", () => {
  assert.deepEqual(R.expression("1 / 3 * 3"), R.rational(1n));
  assert.deepEqual(R.expression("1 + 2 * 3"), R.rational(7n));
  assert.deepEqual(R.expression("-(1,5 + 2.5) * 2 / 4"), R.rational(-2n));
  assert.deepEqual(R.expression("+2 - -3"), R.rational(5n));
  for (const text of [
    "",
    "1 / 0",
    "(1 + 2",
    "2(3)",
    "1..2",
    "1 ** 2",
    "1 +",
    "abs(1)",
  ])
    assert.throws(() => R.expression(text), RangeError);
});

await test("parsing and arithmetic reject inputs beyond their resource limits", () => {
  assert.throws(() => R.parse("1".repeat(1025)), RangeError);
  assert.throws(() => R.parse("1e1025"), RangeError);
  assert.throws(() => R.expression("1".repeat(1025)), RangeError);
  assert.throws(() => R.rational(10n ** 4096n), RangeError);
  assert.throws(() => R.rational(1n, 10n ** 4096n), RangeError);
});

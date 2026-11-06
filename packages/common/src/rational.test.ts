import assert from "node:assert/strict";
import { test } from "node:test";

import * as R from "./rational.js";

await test("arithmetic reduces fractions, normalizes signs and keeps exact identities", () => {
  assert.deepEqual(R.rational(6n, -8n), { numerator: -3n, denominator: 4n });
  assert.deepEqual(R.rational(0n, -7n), { numerator: 0n, denominator: 1n });
  assert.deepEqual(R.divide(R.rational(2n, 3n), R.rational(-4n, 9n)), {
    numerator: -3n,
    denominator: 2n,
  });
  assert.throws(() => R.rational(1n, 0n), RangeError);
  assert.throws(() => R.divide(R.rational(1n), R.rational(0n)), RangeError);
  const values = [
    R.rational(0n),
    R.rational(1n),
    R.rational(-7n, 3n),
    R.rational(11n, 7n),
    R.rational(900719925474099301n, 100n),
  ];
  for (const a of values)
    for (const b of values) {
      assert.deepEqual(R.add(a, b), R.add(b, a));
      assert.deepEqual(R.subtract(R.add(a, b), b), a);
      assert.deepEqual(R.multiply(a, b), R.multiply(b, a));
      if (b.numerator !== 0n)
        assert.deepEqual(R.divide(R.multiply(a, b), b), a);
      for (const c of values)
        assert.deepEqual(
          R.multiply(a, R.add(b, c)),
          R.add(R.multiply(a, b), R.multiply(a, c)),
        );
    }
});

await test("parsing accepts short plain decimals only", () => {
  for (const [text, numerator, denominator] of [
    [".125", 1n, 8n],
    ["123.", 123n, 1n],
    [" -12.50 ", -25n, 2n],
    ["+0.000", 0n, 1n],
    ["00012.3400", 617n, 50n],
    ["9".repeat(100), 10n ** 100n - 1n, 1n],
  ] as const)
    assert.deepEqual(R.parse(text), { numerator, denominator }, text);
  for (const text of [
    "",
    ".",
    "-",
    "NaN",
    "Infinity",
    "1/3",
    "1.2.3",
    "1,25",
    "1e5",
    "0x10",
    "--1",
    "9".repeat(101),
  ])
    assert.throws(() => R.parse(text), RangeError, text);
});

await test("rounding takes signed ties away from zero and formatting stays exact", () => {
  for (const [numerator, denominator, expected] of [
    [0n, 1n, 0n],
    [1n, 2n, 1n],
    [-1n, 2n, -1n],
    [4999n, 10000n, 0n],
    [-5001n, 10000n, -1n],
    [90071992547409935n, 10n, 9007199254740994n],
  ])
    assert.equal(R.round(R.rational(numerator, denominator)), expected);
  for (const [numerator, denominator, text] of [
    [0n, 1n, "0"],
    [-7n, 8n, "-0.875"],
    [1n, 1024n, "0.0009765625"],
    [900719925474099301n, 100n, "9007199254740993.01"],
  ] as const)
    assert.equal(R.decimalText(R.rational(numerator, denominator)), text);
  assert.throws(() => R.decimalText(R.rational(1n, 3n)), RangeError);
  assert.equal(R.fixed(-1n, 2), "-0.01");
  assert.equal(R.fixed(-123n, 0), "-123");
  assert.equal(R.fixed(12n, 4), "0.0012");
});

await test("allocations conserve totals and honor remainder priority across signed inputs", () => {
  for (const denominator of [2n, 3n, 7n, 100n]) {
    for (let seed = -30n; seed <= 30n; seed++) {
      const numerators = [seed * 3n, seed + 1n, -seed * 2n - 1n, 0n];
      const total = R.round(
        R.rational(
          numerators.reduce((a, b) => a + b, 0n),
          denominator,
        ),
      );
      const units = R.allocate(
        total,
        numerators.map((n) => R.rational(n, denominator)),
      );
      assert.equal(
        units.reduce((a, b) => a + b, 0n),
        total,
      );
      assert.equal(units[3], 0n);
      const remainders = numerators.map(
        (n) => ((n % denominator) + denominator) % denominator,
      );
      const floors = numerators.map(
        (n, i) => (n - remainders[i]) / denominator,
      );
      for (let i = 0; i < units.length; i++) {
        assert.ok(units[i] === floors[i] || units[i] === floors[i] + 1n);
        if (units[i] !== floors[i] + 1n) continue;
        for (let j = 0; j < units.length; j++)
          if (units[j] === floors[j])
            assert.ok(
              remainders[i] > remainders[j] ||
                (remainders[i] === remainders[j] && i < j),
            );
      }
    }
  }
  assert.deepEqual(
    R.allocate(2n, [
      R.rational(2n, 3n),
      R.rational(2n, 3n),
      R.rational(2n, 3n),
    ]),
    [1n, 1n, 0n],
  );
  assert.deepEqual(R.allocate(0n, []), []);
  assert.throws(() => R.allocate(0n, [R.rational(1n)]), RangeError);
  assert.throws(() => R.allocate(2n, []), RangeError);
});

await test("expressions honor precedence and associativity without intermediate rounding", () => {
  for (const [expression, numerator, denominator] of [
    ["1 / 3 * 3", 1n, 1n],
    ["1 + 2 * 3", 7n, 1n],
    ["8 / 4 / 2", 1n, 1n],
    ["8 / (4 / 2)", 4n, 1n],
    ["5 - 3 - 1", 1n, 1n],
    ["-(1,5 + 2.5) * 2 / 4", -2n, 1n],
    ["--(2 + +3)", 5n, 1n],
    ["1,25 + .75", 2n, 1n],
    ["1 / (2 + 1)", 1n, 3n],
    ["9007199254740993.01 + .01", 450359962737049651n, 50n],
  ] as const)
    assert.deepEqual(
      R.expression(expression),
      { numerator, denominator },
      expression,
    );
  for (const text of [
    "",
    "()",
    "1 +",
    "(1 + 2",
    "(1 + 2))",
    "2(3)",
    "1 2",
    "1,2,3",
    "1 / 0",
    "1 ** 2",
    "2^3",
    "1e3",
    "abs(1)",
    "1+".repeat(100) + "1",
  ])
    assert.throws(() => R.expression(text), RangeError, text.slice(0, 20));
});

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
  assert.throws(() => R.parse("1".repeat(1025)), R.OutOfRangeError);
  assert.throws(() => R.parse("1e1025"), R.OutOfRangeError);
  assert.throws(() => R.expression("1".repeat(1025)), R.OutOfRangeError);
  assert.throws(() => R.rational(10n ** 4096n), R.OutOfRangeError);
  assert.throws(() => R.rational(1n, 10n ** 4096n), R.OutOfRangeError);
});

await test("arithmetic preserves exact identities across signed fractions and large integers", () => {
  const values = [
    R.rational(0n),
    R.rational(1n),
    R.rational(-7n, 3n),
    R.rational(11n, 7n),
    R.rational(900719925474099301n, 100n),
    R.rational(-12345678901234567890123456789012345678n, 125n),
  ];
  for (const a of values) {
    assert.deepEqual(R.negate(R.negate(a)), a);
    assert.deepEqual(R.multiply(a, R.rational(0n)), R.rational(0n));
    for (const b of values) {
      assert.deepEqual(R.add(a, b), R.add(b, a));
      assert.deepEqual(R.subtract(R.add(a, b), b), a);
      assert.deepEqual(R.multiply(a, b), R.multiply(b, a));
      if (b.numerator !== 0n)
        assert.deepEqual(R.divide(R.multiply(a, b), b), a);
      for (const c of values) {
        assert.deepEqual(R.add(R.add(a, b), c), R.add(a, R.add(b, c)));
        assert.deepEqual(
          R.multiply(a, R.add(b, c)),
          R.add(R.multiply(a, b), R.multiply(a, c)),
        );
      }
    }
  }
  assert.deepEqual(R.divide(R.rational(2n, 3n), R.rational(-4n, 9n)), {
    numerator: -3n,
    denominator: 2n,
  });
});

await test("parsing accepts exact decimal forms at the input and exponent boundaries", () => {
  for (const [text, numerator, denominator] of [
    ["123.", 123n, 1n],
    ["+.5e+2", 50n, 1n],
    ["-.005", -1n, 200n],
    ["00012.3400", 617n, 50n],
    ["-0e+1024", 0n, 1n],
    ["1e1024", 10n ** 1024n, 1n],
    ["1e-1024", 1n, 10n ** 1024n],
    ["9".repeat(1024), 10n ** 1024n - 1n, 1n],
    ["1.0e-1024", 1n, 10n ** 1024n],
    ["10e-1025", 1n, 10n ** 1024n],
    ["0.0001e1028", 10n ** 1024n, 1n],
    [`1${"0".repeat(1023)}`, 10n ** 1023n, 1n],
    ["0e9007199254740993", 0n, 1n],
  ] as const)
    assert.deepEqual(R.parse(text), { numerator, denominator }, text);
  for (const text of ["1e-1025", "1.1e-1024", "10e1024", "1e9007199254740993"])
    assert.throws(() => R.parse(text), R.OutOfRangeError, text);
});

await test("syntax errors stay distinct from well-formed out-of-range values", () => {
  for (const input of [42, null, undefined, {}, 1n])
    assert.throws(() => R.parse(input as string), { name: "RangeError" });
  for (const text of [
    ".",
    "+",
    "-",
    "1 2",
    "1,25",
    "0x10",
    "1e+",
    "1_000",
    "--1",
  ])
    assert.throws(() => R.parse(text), { name: "RangeError" }, text);
  assert.throws(() => R.rational(0n, 0n), { name: "RangeError" });
  const error = new R.OutOfRangeError("Too large");
  assert.ok(error instanceof RangeError);
  assert.equal(error.name, "OutOfRangeError");
  assert.equal(error.message, "Too large");
});

await test("rounding covers both sides of signed ties without converting to numbers", () => {
  for (const [numerator, denominator, expected] of [
    [0n, 1n, 0n],
    [1n, 2n, 1n],
    [-1n, 2n, -1n],
    [4999n, 10000n, 0n],
    [-4999n, 10000n, 0n],
    [5001n, 10000n, 1n],
    [-5001n, 10000n, -1n],
    [90071992547409935n, 10n, 9007199254740994n],
    [-90071992547409935n, 10n, -9007199254740994n],
  ])
    assert.equal(R.round(R.rational(numerator, denominator)), expected);
});

await test("decimal formatting supports terminating fractions, signs, zeros and whole units", () => {
  for (const [numerator, denominator, text] of [
    [0n, 1n, "0"],
    [12n, 1n, "12"],
    [-7n, 8n, "-0.875"],
    [1n, 125n, "0.008"],
    [1n, 1024n, "0.0009765625"],
    [900719925474099301n, 100n, "9007199254740993.01"],
  ] as const)
    assert.equal(R.decimalText(R.rational(numerator, denominator)), text);
  for (const denominator of [3n, 6n, 7n, 15n])
    assert.throws(() => R.decimalText(R.rational(1n, denominator)), {
      name: "RangeError",
    });
  assert.equal(R.fixed(-123n, 0), "-123");
  assert.equal(R.fixed(0n, 3), "0.000");
  assert.equal(R.fixed(12n, 4), "0.0012");
});

await test("storage decimals accept both signed endpoints and ignore insignificant zeros", () => {
  const largest = `${"9".repeat(38)}${"0".repeat(88)}`;
  const smallest = `0.${"0".repeat(129)}1`;
  for (const sign of ["", "-"]) {
    assert.equal(
      R.storageDecimal(`${sign}${"9".repeat(38)}e88`),
      sign + largest,
    );
    assert.equal(R.storageDecimal(`${sign}1e-130`), sign + smallest);
    assert.equal(
      R.storageDecimal(`${sign}1e125`),
      `${sign}1${"0".repeat(125)}`,
    );
    for (const text of [
      "1e126",
      "1e-131",
      "9".repeat(39),
      `0.${"1".repeat(39)}`,
    ])
      assert.throws(() => R.storageDecimal(sign + text), R.OutOfRangeError);
  }
  assert.equal(R.storageDecimal("-0.000e125"), "0");
  assert.equal(R.storageDecimal(`1.${"0".repeat(100)}`), "1");
  assert.equal(R.storageDecimal("0.0000012300"), "0.00000123");
  assert.throws(() => R.storageDecimal("not a decimal"), {
    name: "RangeError",
  });
});

await test("allocations conserve totals and honor remainder priority across signed inputs", () => {
  for (const denominator of [2n, 3n, 7n, 100n]) {
    for (let seed = -30n; seed <= 30n; seed++) {
      const numerators = [seed * 3n, seed + 1n, -seed * 2n - 1n, 0n];
      const sum = numerators.reduce((a, b) => a + b, 0n);
      const magnitude = sum < 0n ? -sum : sum;
      const rounded = (2n * magnitude + denominator) / (2n * denominator);
      const total = sum < 0n ? -rounded : rounded;
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
        for (let j = 0; j < units.length; j++) {
          if (units[j] !== floors[j]) continue;
          assert.ok(
            remainders[i] > remainders[j] ||
              (remainders[i] === remainders[j] && i < j),
          );
        }
      }
    }
  }
  assert.deepEqual(
    R.allocate(1n, [
      R.rational(1n, 6n),
      R.rational(1n, 3n),
      R.rational(1n, 2n),
    ]),
    [0n, 0n, 1n],
  );
  assert.deepEqual(
    R.allocate(1n, [
      R.rational(1n, 2n),
      R.rational(1n, 3n),
      R.rational(1n, 6n),
    ]),
    [1n, 0n, 0n],
  );
});

await test("expression operators associate correctly and reject unsupported or incomplete syntax", () => {
  for (const [expression, numerator, denominator] of [
    ["8 / 4 / 2", 1n, 1n],
    ["8 / (4 / 2)", 4n, 1n],
    ["5 - 3 - 1", 1n, 1n],
    ["5 - (3 - 1)", 3n, 1n],
    ["2 * -3", -6n, 1n],
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
  for (let i = -20; i <= 20; i++)
    assert.deepEqual(R.expression(`(${String(i)} / 7) * 7 - (${String(i)})`), {
      numerator: 0n,
      denominator: 1n,
    });
  for (const text of [
    "()",
    "1 2",
    "1,2,3",
    "(1 + 2))",
    "1+)2(",
    "0 / 0",
    "3 // 2",
    "2^3",
    "1e3",
  ])
    assert.throws(() => R.expression(text), { name: "RangeError" }, text);
  assert.deepEqual(R.expression(`1${" ".repeat(1023)}`), {
    numerator: 1n,
    denominator: 1n,
  });
});

await test("resource bounds apply after reduction and to arithmetic results", () => {
  const max = 10n ** 4096n - 1n;
  const power = 10n ** 4095n;
  assert.deepEqual(R.rational(max), { numerator: max, denominator: 1n });
  assert.deepEqual(R.rational(9n * 10n ** 4096n, 10n ** 4096n), {
    numerator: 9n,
    denominator: 1n,
  });
  assert.deepEqual(R.multiply(R.rational(power, 3n), R.rational(3n, power)), {
    numerator: 1n,
    denominator: 1n,
  });
  assert.throws(
    () => R.add(R.rational(max), R.rational(1n)),
    R.OutOfRangeError,
  );
  assert.throws(
    () => R.multiply(R.rational(max), R.rational(10n)),
    R.OutOfRangeError,
  );
  assert.throws(
    () => R.divide(R.rational(1n, power), R.rational(10n)),
    R.OutOfRangeError,
  );
});

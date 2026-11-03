import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import * as D from "@tasan/common/money";

await test("Money keeps large amounts exact and supports same-currency arithmetic", () => {
  const a = D.create("9007199254740993.01", "EUR");
  const b = D.create("0.01", "EUR");
  assert.equal(a.minorUnits, 900719925474099301n);
  assert.equal(D.toString(D.add(a, b)), "9007199254740993.02");
  assert.deepEqual(D.add(a, b), D.add(b, a));
  assert.deepEqual(D.sub(D.add(a, b), b), a);
  assert.deepEqual(D.negate(D.negate(a)), a);
  assert.equal(D.compare(a, b), 1);
  assert.ok(Object.isFrozen(a));
});

await test("quantization and equivalent calculations use signed ties away from zero", () => {
  for (const sign of ["", "-"]) {
    assert.deepEqual(
      D.round(`${sign}1.005`, "EUR"),
      D.calculate(`${sign}1 * 1.005`, "EUR"),
    );
    assert.equal(D.toString(D.round(`${sign}1.005`, "EUR")), `${sign}1.01`);
    assert.deepEqual(
      D.calculate(`${sign}0.03 / 2`, "EUR"),
      D.calculate(`${sign}0.03 * 0.5`, "EUR"),
    );
    assert.equal(
      D.toString(D.calculate(`${sign}0.03 / 2`, "EUR")),
      `${sign}0.02`,
    );
  }
  assert.equal(D.toString(D.calculate("1 / 3 * 3", "EUR")), "1.00");
  assert.equal(D.toString(D.round("-0.001", "EUR")), "0.00");
});

await test("constructors reject invalid amounts, currencies, and implicit precision changes", () => {
  for (const text of [
    "NaN",
    "Infinity",
    "-Infinity",
    "",
    "1.001",
    "1e126",
    "1".repeat(39),
    "1e999999",
  ])
    assert.throws(() => D.create(text, "EUR"), RangeError);
  for (const value of [NaN, Infinity, 1.005])
    assert.throws(
      () => D.create(value as unknown as string, "EUR"),
      RangeError,
    );
  assert.throws(() => D.create("1", "invalid" as "EUR"), RangeError);
  assert.throws(() => D.create("1", "__proto__"), RangeError);
  assert.throws(() => D.create("1.5", "JPY"), RangeError);
  assert.throws(() => D.calculate("1 / 0", "EUR"), RangeError);
  const euros = D.create("1", "EUR");
  const dollars = D.create("1", "USD");
  const yen = D.create("1", "JPY");
  for (const other of [dollars, yen])
    for (const operation of [D.add, D.sub, D.compare, D.equals])
      assert.throws(() => operation(euros, other), RangeError);
});

await test("supported decimal precision and magnitude boundaries are enforced", () => {
  const largest = D.create(`${"9".repeat(38)}e88`, "EUR");
  assert.equal(D.toString(largest), `${"9".repeat(38)}${"0".repeat(88)}.00`);
  assert.throws(() => D.add(largest, D.create("1e88", "EUR")), RangeError);
  assert.equal(Rate.create("1e-130"), `0.${"0".repeat(129)}1`);
  assert.throws(() => Rate.create("1e-131"), RangeError);
  assert.equal(
    Rate.create("0.12345678901234567890123456789012345678"),
    "0.12345678901234567890123456789012345678",
  );
  for (const text of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e126",
    "0.123456789012345678901234567890123456789",
  ])
    assert.throws(() => Rate.create(text), RangeError);
  assert.equal(Rate.reciprocal(Rate.create("3"), 5), "0.33333");
});

await test("conversion retains rates and conserves totals with signed parts", () => {
  assert.equal(
    D.toString(
      D.convert(D.create("86500", "JPY"), Rate.create("0.00565"), "EUR"),
    ),
    "488.73",
  );
  const converted = D.convertAndAllocate(
    D.create("0.01", "EUR"),
    [D.create("-0.01", "EUR"), D.create("0.02", "EUR")],
    Rate.create("0.5"),
    "EUR",
  );
  assert.deepEqual(converted.parts.map(D.toString), ["0.00", "0.01"]);
  assert.deepEqual(
    converted.parts.reduce(D.add, D.create("0", "EUR")),
    converted.total,
  );
  assert.throws(
    () =>
      D.convertAndAllocate(
        D.create("1", "EUR"),
        [D.create("0.99", "EUR")],
        Rate.create("1"),
        "EUR",
      ),
    RangeError,
  );
  const nearTie = D.convertAndAllocate(
    D.create("0.04", "EUR"),
    [D.create("0.01", "EUR"), D.create("0.03", "EUR")],
    Rate.create("0.50000000000000000000000000000000000001"),
    "EUR",
  );
  assert.deepEqual(nearTie.parts.map(D.toString), ["0.00", "0.02"]);
});

await test("weighted allocation is exact, signed, and honours caller tie order", () => {
  for (let units = -101n; units <= 101n; units++) {
    const total = D.fromMinorUnits(units, "EUR");
    const parts = D.allocate(total, ["0", "1", "1", "1"]);
    assert.equal(parts[0].minorUnits, 0n);
    assert.equal(
      parts.reduce((sum, part) => sum + part.minorUnits, 0n),
      units,
    );
  }
  assert.deepEqual(
    D.allocate(D.create("0.02", "EUR"), ["1", "1", "1"]).map(D.toString),
    ["0.01", "0.01", "0.00"],
  );
  assert.deepEqual(
    D.allocate(D.create("0.01", "EUR"), [
      "1",
      "1.0000000000000000000000000000000000001",
    ]).map(D.toString),
    ["0.00", "0.01"],
  );
});

await test("equivalent decimal scales produce the same Money and rate values", () => {
  const a = D.create("1.0", "EUR");
  const b = D.create("1.00", "EUR");
  assert.deepEqual(a, b);
  assert.deepEqual(D.add(a, b), D.add(b, a));
  assert.equal(Rate.create("1.00500"), Rate.create("1005e-3"));
});

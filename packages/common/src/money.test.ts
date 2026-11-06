import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "./exchange-rate.js";
import * as M from "./money.js";

await test("Money keeps large amounts exact and supports same-currency arithmetic", () => {
  const a = M.create("9007199254740993.01", "EUR");
  const b = M.create("0.01", "EUR");
  assert.equal(a.minorUnits, 900719925474099301n);
  assert.equal(M.toString(M.add(a, b)), "9007199254740993.02");
  assert.deepEqual(M.add(a, b), M.add(b, a));
  assert.deepEqual(M.sub(M.add(a, b), b), a);
  assert.deepEqual(M.negate(M.negate(a)), a);
  assert.equal(M.compare(a, b), 1);
  assert.ok(Object.isFrozen(a));
});

await test("quantization and equivalent calculations use signed ties away from zero", () => {
  for (const sign of ["", "-"]) {
    assert.deepEqual(
      M.round(`${sign}1.005`, "EUR"),
      M.calculate(`${sign}1 * 1.005`, "EUR"),
    );
    assert.equal(M.toString(M.round(`${sign}1.005`, "EUR")), `${sign}1.01`);
    assert.deepEqual(
      M.calculate(`${sign}0.03 / 2`, "EUR"),
      M.calculate(`${sign}0.03 * 0.5`, "EUR"),
    );
    assert.equal(
      M.toString(M.calculate(`${sign}0.03 / 2`, "EUR")),
      `${sign}0.02`,
    );
  }
  assert.equal(M.toString(M.calculate("1 / 3 * 3", "EUR")), "1.00");
  assert.equal(M.toString(M.round("-0.001", "EUR")), "0.00");
});

await test("constructors reject invalid amounts, currencies, and implicit precision changes", () => {
  for (const text of [
    "NaN",
    "Infinity",
    "-Infinity",
    "",
    "1.001",
    "1e5",
    "1.2.3",
  ])
    assert.throws(() => M.create(text, "EUR"), RangeError);
  for (const value of [NaN, Infinity, 1.005])
    assert.throws(
      () => M.create(value as unknown as string, "EUR"),
      RangeError,
    );
  assert.throws(() => M.create("1", "invalid" as "EUR"), RangeError);
  assert.throws(() => M.create("1", "__proto__"), RangeError);
  assert.throws(() => M.create("1.5", "JPY"), RangeError);
  assert.throws(() => M.calculate("1 / 0", "EUR"), RangeError);
  const euros = M.create("1", "EUR");
  const dollars = M.create("1", "USD");
  const yen = M.create("1", "JPY");
  for (const other of [dollars, yen])
    for (const operation of [M.add, M.sub, M.compare, M.equals])
      assert.throws(() => operation(euros, other), RangeError);
});

await test("arithmetic stays exact beyond the range of JS numbers", () => {
  const large = M.create("99999999999999999999999999999999999999", "EUR");
  const wider = M.add(large, M.create("0.01", "EUR"));
  assert.equal(M.toString(wider), "99999999999999999999999999999999999999.01");
  assert.deepEqual(M.sub(wider, large), M.create("0.01", "EUR"));
});

await test("conversion retains rates and conserves totals with signed parts", () => {
  assert.equal(
    M.toString(
      M.convertAndAllocate(
        M.create("86500", "JPY"),
        [M.create("86500", "JPY")],
        Rate.create("0.00565"),
        "EUR",
      ).total,
    ),
    "488.73",
  );
  const converted = M.convertAndAllocate(
    M.create("0.01", "EUR"),
    [M.create("-0.01", "EUR"), M.create("0.02", "EUR")],
    Rate.create("0.5"),
    "EUR",
  );
  assert.deepEqual(converted.parts.map(M.toString), ["0.00", "0.01"]);
  assert.deepEqual(
    converted.parts.reduce(M.add, M.create("0", "EUR")),
    converted.total,
  );
  assert.throws(
    () =>
      M.convertAndAllocate(
        M.create("1", "EUR"),
        [M.create("0.99", "EUR")],
        Rate.create("1"),
        "EUR",
      ),
    RangeError,
  );
  const nearTie = M.convertAndAllocate(
    M.create("0.04", "EUR"),
    [M.create("0.01", "EUR"), M.create("0.03", "EUR")],
    Rate.create("0.5000000000000001"),
    "EUR",
  );
  assert.deepEqual(nearTie.parts.map(M.toString), ["0.00", "0.02"]);
});

await test("weighted allocation is exact, signed, and honours caller tie order", () => {
  for (let units = -101n; units <= 101n; units++) {
    const total = M.fromMinorUnits(units, "EUR");
    const parts = M.allocate(total, ["0", "1", "1", "1"]);
    assert.equal(parts[0].minorUnits, 0n);
    assert.equal(
      parts.reduce((sum, part) => sum + part.minorUnits, 0n),
      units,
    );
  }
  assert.deepEqual(
    M.allocate(M.create("0.02", "EUR"), ["1", "1", "1"]).map(M.toString),
    ["0.01", "0.01", "0.00"],
  );
  assert.deepEqual(
    M.allocate(M.create("0.01", "EUR"), [
      "1",
      "1.0000000000000000000000000000000000001",
    ]).map(M.toString),
    ["0.00", "0.01"],
  );
});

await test("weighted allocation conserves the total or throws", () => {
  assert.deepEqual(
    M.allocate(M.create("0", "EUR"), ["0", "0"]).map(M.toString),
    ["0.00", "0.00"],
  );
  for (const weights of [["0", "0"], []])
    assert.throws(() => M.allocate(M.create("10", "EUR"), weights), RangeError);
});

await test("share weights are decimals from zero to one million", () => {
  assert.equal(M.weight(" 1,50 "), "1.5");
  assert.equal(M.weight(""), "0");
  assert.equal(M.weight("1000000"), "1000000");
  for (const text of ["-1", "1000000.01", "abc"])
    assert.throws(() => M.weight(text), RangeError, text);
  assert.equal(M.stepWeight("0.5", -1), "0");
  assert.throws(() => M.stepWeight("1000000", 1), RangeError);
});

await test("equivalent decimal scales produce the same Money values", () => {
  const a = M.create("1.0", "EUR");
  const b = M.create("1.00", "EUR");
  assert.deepEqual(a, b);
  assert.deepEqual(M.add(a, b), M.add(b, a));
});

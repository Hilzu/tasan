import assert from "node:assert/strict";
import { test } from "node:test";

import { genUserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";

import {
  calculateExpenseAmounts,
  calculateShareAmounts,
  parseShares,
  type ShareInput,
  stepShares,
} from "./expense-amounts";

const ids = Array.from({ length: 4 }, () => genUserID());
const [payer, second, third, fourth] = ids;
const inputs = (values: (number | undefined)[], fractions = 0) =>
  new Map(
    values.map((value, i) => [
      ids[i],
      value === undefined ? undefined : (
        M.round(String(value), fractions === 0 ? "JPY" : "EUR")
      ),
    ]),
  );
const values = (result: ReturnType<typeof calculateExpenseAmounts>) =>
  [...result.participants.values()].map((participantAmount) =>
    Number(M.toString(participantAmount)),
  );
await test("starts empty and handles no participants", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([undefined, undefined]),
    "JPY",
    payer,
  );
  assert.equal(result.hasAmounts, false);
  assert.equal(result.valid, false);
  assert.equal(Number(M.toString(result.amount)), 0);
  assert.deepEqual(values(result), [0, 0]);
  assert.equal(
    Number(
      M.toString(
        calculateExpenseAmounts(M.create("100", "JPY"), new Map(), "JPY", payer)
          .difference,
      ),
    ),
    100,
  );
});

await test("total first splits equally and specific amounts take precedence", () => {
  const total = M.create("10000", "JPY");
  assert.deepEqual(
    values(
      calculateExpenseAmounts(
        total,
        inputs([undefined, undefined, undefined, undefined]),
        "JPY",
        payer,
      ),
    ),
    [2500, 2500, 2500, 2500],
  );
  assert.deepEqual(
    values(
      calculateExpenseAmounts(
        total,
        inputs([1000, undefined, undefined, undefined]),
        "JPY",
        payer,
      ),
    ),
    [1000, 3000, 3000, 3000],
  );
});

await test("individual amounts first calculate the total", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([2000, 3000, 1500, 2500]),
    "JPY",
    payer,
  );
  assert.equal(Number(M.toString(result.amount)), 9000);
  assert.equal(result.valid, true);
  assert.deepEqual(values(result), [2000, 3000, 1500, 2500]);
  assert.equal(Number(M.toString(result.difference)), 0);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(
        undefined,
        inputs([100, undefined]),
        "JPY",
        payer,
      ),
    ),
    [100, 0],
  );
});

await test("changing total, selection, and clearing an amount preserves other specific amounts", () => {
  const amounts = inputs([1000, undefined, undefined, undefined]);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(M.create("7000", "JPY"), amounts, "JPY", payer),
    ),
    [1000, 2000, 2000, 2000],
  );
  amounts.delete(fourth);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(M.create("7000", "JPY"), amounts, "JPY", payer),
    ),
    [1000, 3000, 3000],
  );
  amounts.set(fourth, undefined);
  amounts.set(payer, undefined);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(M.create("10000", "JPY"), amounts, "JPY", payer),
    ),
    [2500, 2500, 2500, 2500],
  );
});

await test("clearing total returns to the sum of specific amounts", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([1000, 2000, undefined, undefined]),
    "JPY",
    payer,
  );
  assert.equal(Number(M.toString(result.amount)), 3000);
  assert.deepEqual(values(result), [1000, 2000, 0, 0]);
});

await test("mismatches preserve amounts without negative automatic amounts", () => {
  const total = M.create("100", "JPY");
  const under = calculateExpenseAmounts(total, inputs([40, 50]), "JPY", payer);
  assert.equal(Number(M.toString(under.difference)), 10);
  assert.equal(under.valid, false);
  assert.deepEqual(values(under), [40, 50]);
  const over = calculateExpenseAmounts(
    total,
    inputs([110, undefined]),
    "JPY",
    payer,
  );
  assert.equal(Number(M.toString(over.difference)), -10);
  assert.equal(over.valid, false);
  assert.deepEqual(values(over), [110, 0]);
});

await test("JPY and EUR rounding sums to the total", () => {
  for (const fractions of [0, 2]) {
    for (let units = 10; units <= 200; units++) {
      const total = M.round(
        String(units / 10 ** fractions),
        fractions === 0 ? "JPY" : "EUR",
      );
      for (const selected of [
        inputs([undefined, undefined, undefined], fractions),
        inputs([undefined, undefined, undefined, undefined], fractions),
      ]) {
        const result = calculateExpenseAmounts(
          total,
          selected,
          fractions === 0 ? "JPY" : "EUR",
          third,
        );
        assert.equal(Number(M.toString(result.difference)), 0);
        assert.ok(values(result).every((value) => value >= 0));
        const minorUnits = values(result).map((value) =>
          Math.round(value * 10 ** fractions),
        );
        assert.ok(Math.max(...minorUnits) - Math.min(...minorUnits) <= 1);
      }
    }
  }
  const noPayer = new Map([
    [second, undefined],
    [third, undefined],
  ]);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(M.create("100", "JPY"), noPayer, "JPY", payer),
    ),
    [50, 50],
  );
});

await test("currency changes round specific amounts before calculating remainder", () => {
  const result = calculateExpenseAmounts(
    M.round("10.25", "JPY"),
    inputs([3, undefined], 0),
    "JPY",
    payer,
  );
  assert.equal(Number(M.toString(result.amount)), 10);
  assert.deepEqual(values(result), [3, 7]);
  assert.equal(Number(M.toString(result.difference)), 0);
});

await test("explicit amounts must be positive at the currency precision", () => {
  for (const participantAmount of [0, -1]) {
    const result = calculateExpenseAmounts(
      M.create("100", "JPY"),
      inputs([participantAmount, undefined], 0),
      "JPY",
      payer,
    );
    assert.deepEqual([...result.invalidAmounts], [payer]);
    assert.equal(result.valid, false);
  }
});
const shareInputs = (
  values: [number | undefined, number?][],
  fractions = 0,
): Map<(typeof ids)[number], ShareInput> =>
  new Map(
    values.map(([shares, adjustment], i) => [
      ids[i],
      {
        shares: shares === undefined ? undefined : String(shares),
        adjustment:
          adjustment === undefined ? undefined : (
            M.round(String(adjustment), fractions === 0 ? "JPY" : "EUR")
          ),
      },
    ]),
  );
const shareValues = (result: ReturnType<typeof calculateShareAmounts>) =>
  [...result.participants.values()].map((value) => Number(M.toString(value)));
await test("shares default to zero and leave the total unallocated", () => {
  const result = calculateShareAmounts(
    M.create("3000", "JPY"),
    shareInputs([[0], [0], [0]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(result), [0, 0, 0]);
  assert.equal(Number(M.toString(result.difference)), 3000);
  assert.equal(result.invalidAmounts.size, 3);
  assert.equal(result.valid, false);
});

await test("shares split the total proportionally", () => {
  const even = calculateShareAmounts(
    M.create("3000", "JPY"),
    shareInputs([[1], [1], [1]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(even), [1000, 1000, 1000]);
  assert.equal(even.valid, true);
  assert.deepEqual(
    shareValues(
      calculateShareAmounts(
        M.create("3000", "JPY"),
        shareInputs([[2], [1], [0, 500]]),
        "JPY",
        payer,
      ),
    ),
    [1667, 833, 500],
  );
});

await test("negative adjustments lower one share and raise the others", () => {
  const result = calculateShareAmounts(
    M.create("3000", "JPY"),
    shareInputs([[1], [1, -100], [1]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(result), [1034, 933, 1033]);
  assert.equal(Number(M.toString(result.difference)), 0);
  assert.equal(result.valid, true);
});

await test("positive adjustments raise one share and lower the others", () => {
  const result = calculateShareAmounts(
    M.create("4000", "JPY"),
    shareInputs([[1], [1], [1, 1000]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(result), [1000, 1000, 2000]);
  assert.equal(result.valid, true);
});

await test("adjustments alone can allocate the total without shares", () => {
  const result = calculateShareAmounts(
    M.create("1500", "JPY"),
    shareInputs([
      [0, 1000],
      [0, 500],
    ]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(result), [1000, 500]);
  assert.equal(result.valid, true);
});

await test("share mode requires a total and valid shares", () => {
  assert.equal(
    calculateShareAmounts(undefined, shareInputs([[1], [1]]), "JPY", payer)
      .valid,
    false,
  );
  for (const shares of [undefined, -1, NaN]) {
    const result = calculateShareAmounts(
      M.create("100", "JPY"),
      shareInputs([[shares], [1]]),
      "JPY",
      payer,
    );
    assert.deepEqual([...result.invalidShares], [payer]);
    assert.equal(result.valid, false);
  }
});

await test("adjustments that leave someone owing nothing are invalid", () => {
  const result = calculateShareAmounts(
    M.create("1000", "JPY"),
    shareInputs([[1], [1, -600]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(result), [800, 200]);
  assert.equal(result.valid, true);
  const invalid = calculateShareAmounts(
    M.create("1000", "JPY"),
    shareInputs([[1], [1, -1000]]),
    "JPY",
    payer,
  );
  assert.deepEqual(shareValues(invalid), [1000, 0]);
  assert.deepEqual([...invalid.invalidAmounts], [second]);
  assert.equal(invalid.valid, false);
});

await test("share rounding sums to the total and favors the payer on ties", () => {
  assert.deepEqual(
    shareValues(
      calculateShareAmounts(
        M.create("100", "JPY"),
        shareInputs([[1], [1], [1]]),
        "JPY",
        third,
      ),
    ),
    [33, 33, 34],
  );
  for (const fractions of [0, 2]) {
    for (let units = 10; units <= 200; units++) {
      const total = M.round(
        String(units / 10 ** fractions),
        fractions === 0 ? "JPY" : "EUR",
      );
      for (const selected of [
        shareInputs([[1], [2], [0.5]], fractions),
        shareInputs([[1], [1, -0.03], [1], [3, 0.07]], fractions),
      ]) {
        const result = calculateShareAmounts(
          total,
          selected,
          fractions === 0 ? "JPY" : "EUR",
          payer,
        );
        assert.equal(Number(M.toString(result.difference)), 0);
      }
    }
  }
});

await test("share inputs parse and step without going negative", () => {
  assert.equal(parseShares(""), "0");
  assert.equal(parseShares("1,5"), "1.5");
  assert.equal(parseShares("-1"), undefined);
  assert.equal(parseShares("abc"), undefined);
  assert.equal(stepShares("0", 1), "1");
  assert.equal(stepShares("0,1", 1), "1.1");
  assert.equal(stepShares("0.5", -1), "0");
  assert.equal(stepShares("0", -1), "0");
  assert.equal(stepShares("abc", 1), "1");
});

await test("allocation range failures remain recoverable form validation errors", () => {
  const total = M.create("1e125", "EUR");
  const weights = shareInputs([[1], [1], [1]], 2);
  const shared = calculateShareAmounts(total, weights, "EUR", payer);
  assert.equal(shared.valid, false);
  assert.ok(shared.error);
  const explicit = calculateExpenseAmounts(
    undefined,
    new Map([
      [payer, total],
      [second, M.create("0.01", "EUR")],
    ]),
    "EUR",
    payer,
  );
  assert.equal(explicit.valid, false);
  assert.ok(explicit.error);
  // Only the range error applies; nothing derived from a failed calculation.
  assert.equal(explicit.hasAmounts, false);
  for (const result of [shared, explicit]) {
    assert.equal(result.participants.size, 0);
    assert.equal(result.invalidAmounts.size, 0);
  }
});

await test("allocation without automatic participants or shares reports the remainder", () => {
  const explicit = calculateExpenseAmounts(
    M.create("10", "EUR"),
    new Map([[payer, M.create("4", "EUR")]]),
    "EUR",
    payer,
  );
  assert.equal(explicit.error, undefined);
  assert.equal(M.toString(explicit.difference), "6.00");
  const shared = calculateShareAmounts(
    M.create("10", "EUR"),
    shareInputs([[0], [0, 1]], 2),
    "EUR",
    payer,
  );
  assert.equal(shared.error, undefined);
  assert.equal(M.toString(shared.difference), "9.00");
});

await test("share stepping keeps a valid value when the next step exceeds the range", () => {
  assert.equal(stepShares("1e125", 1), M.weight("1e125"));
});

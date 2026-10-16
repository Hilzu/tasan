import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { genUserID } from "@tasan/common/id";

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
      value === undefined ? undefined : D.create(value, fractions),
    ]),
  );
const values = (result: ReturnType<typeof calculateExpenseAmounts>) =>
  [...result.participants.values()].map(
    (participantAmount) => participantAmount.value,
  );

await test("starts empty and handles no participants", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([undefined, undefined]),
    0,
    payer,
  );
  assert.equal(result.hasAmounts, false);
  assert.equal(result.valid, false);
  assert.equal(result.amount.value, 0);
  assert.deepEqual(values(result), [0, 0]);
  assert.equal(
    calculateExpenseAmounts(D.create(100, 0), new Map(), 0, payer).difference
      .value,
    100,
  );
});

await test("total first splits equally and specific amounts take precedence", () => {
  const total = D.create(10000, 0);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(
        total,
        inputs([undefined, undefined, undefined, undefined]),
        0,
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
        0,
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
    0,
    payer,
  );
  assert.equal(result.amount.value, 9000);
  assert.equal(result.valid, true);
  assert.deepEqual(values(result), [2000, 3000, 1500, 2500]);
  assert.equal(result.difference.value, 0);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(undefined, inputs([100, undefined]), 0, payer),
    ),
    [100, 0],
  );
});

await test("changing total, selection, and clearing an amount preserves other specific amounts", () => {
  const amounts = inputs([1000, undefined, undefined, undefined]);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(7000, 0), amounts, 0, payer)),
    [1000, 2000, 2000, 2000],
  );
  amounts.delete(fourth);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(7000, 0), amounts, 0, payer)),
    [1000, 3000, 3000],
  );
  amounts.set(fourth, undefined);
  amounts.set(payer, undefined);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(10000, 0), amounts, 0, payer)),
    [2500, 2500, 2500, 2500],
  );
});

await test("clearing total returns to the sum of specific amounts", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([1000, 2000, undefined, undefined]),
    0,
    payer,
  );
  assert.equal(result.amount.value, 3000);
  assert.deepEqual(values(result), [1000, 2000, 0, 0]);
});

await test("mismatches preserve amounts without negative automatic amounts", () => {
  const total = D.create(100, 0);
  const under = calculateExpenseAmounts(total, inputs([40, 50]), 0, payer);
  assert.equal(under.difference.value, 10);
  assert.equal(under.valid, false);
  assert.deepEqual(values(under), [40, 50]);
  const over = calculateExpenseAmounts(
    total,
    inputs([110, undefined]),
    0,
    payer,
  );
  assert.equal(over.difference.value, -10);
  assert.equal(over.valid, false);
  assert.deepEqual(values(over), [110, 0]);
});

await test("JPY and EUR rounding sums to the total", () => {
  for (const fractions of [0, 2]) {
    for (let units = 10; units <= 200; units++) {
      const total = D.create(units / 10 ** fractions, fractions);
      for (const selected of [
        inputs([undefined, undefined, undefined], fractions),
        inputs([undefined, undefined, undefined, undefined], fractions),
      ]) {
        const result = calculateExpenseAmounts(
          total,
          selected,
          fractions,
          third,
        );
        assert.equal(result.difference.value, 0);
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
    values(calculateExpenseAmounts(D.create(100, 0), noPayer, 0, payer)),
    [50, 50],
  );
});

await test("currency changes round specific amounts before calculating remainder", () => {
  const result = calculateExpenseAmounts(
    D.create(10.25, 2),
    inputs([2.55, undefined], 2),
    0,
    payer,
  );
  assert.equal(result.amount.value, 10);
  assert.deepEqual(values(result), [3, 7]);
  assert.equal(result.difference.value, 0);
});

await test("explicit amounts must be positive at the currency precision", () => {
  for (const participantAmount of [0, -1]) {
    const result = calculateExpenseAmounts(
      D.create(100, 0),
      inputs([participantAmount, undefined], 2),
      0,
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
        shares,
        adjustment:
          adjustment === undefined ? undefined : (
            D.create(adjustment, fractions)
          ),
      },
    ]),
  );
const shareValues = (result: ReturnType<typeof calculateShareAmounts>) =>
  [...result.participants.values()].map((value) => value.value);

await test("shares default to zero and leave the total unallocated", () => {
  const result = calculateShareAmounts(
    D.create(3000, 0),
    shareInputs([[0], [0], [0]]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(result), [0, 0, 0]);
  assert.equal(result.difference.value, 3000);
  assert.equal(result.invalidAmounts.size, 3);
  assert.equal(result.valid, false);
});

await test("shares split the total proportionally", () => {
  const even = calculateShareAmounts(
    D.create(3000, 0),
    shareInputs([[1], [1], [1]]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(even), [1000, 1000, 1000]);
  assert.equal(even.valid, true);
  assert.deepEqual(
    shareValues(
      calculateShareAmounts(
        D.create(3000, 0),
        shareInputs([[2], [1], [0, 500]]),
        0,
        payer,
      ),
    ),
    [1667, 833, 500],
  );
});

await test("negative adjustments lower one share and raise the others", () => {
  const result = calculateShareAmounts(
    D.create(3000, 0),
    shareInputs([[1], [1, -100], [1]]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(result), [1034, 933, 1033]);
  assert.equal(result.difference.value, 0);
  assert.equal(result.valid, true);
});

await test("positive adjustments raise one share and lower the others", () => {
  const result = calculateShareAmounts(
    D.create(4000, 0),
    shareInputs([[1], [1], [1, 1000]]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(result), [1000, 1000, 2000]);
  assert.equal(result.valid, true);
});

await test("adjustments alone can allocate the total without shares", () => {
  const result = calculateShareAmounts(
    D.create(1500, 0),
    shareInputs([
      [0, 1000],
      [0, 500],
    ]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(result), [1000, 500]);
  assert.equal(result.valid, true);
});

await test("share mode requires a total and valid shares", () => {
  assert.equal(
    calculateShareAmounts(undefined, shareInputs([[1], [1]]), 0, payer).valid,
    false,
  );
  for (const shares of [undefined, -1, NaN]) {
    const result = calculateShareAmounts(
      D.create(100, 0),
      shareInputs([[shares], [1]]),
      0,
      payer,
    );
    assert.deepEqual([...result.invalidShares], [payer]);
    assert.equal(result.valid, false);
  }
});

await test("adjustments that leave someone owing nothing are invalid", () => {
  const result = calculateShareAmounts(
    D.create(1000, 0),
    shareInputs([[1], [1, -600]]),
    0,
    payer,
  );
  assert.deepEqual(shareValues(result), [800, 200]);
  assert.equal(result.valid, true);
  const invalid = calculateShareAmounts(
    D.create(1000, 0),
    shareInputs([[1], [1, -1000]]),
    0,
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
        D.create(100, 0),
        shareInputs([[1], [1], [1]]),
        0,
        third,
      ),
    ),
    [33, 33, 34],
  );
  for (const fractions of [0, 2]) {
    for (let units = 10; units <= 200; units++) {
      const total = D.create(units / 10 ** fractions, fractions);
      for (const selected of [
        shareInputs([[1], [2], [0.5]], fractions),
        shareInputs([[1], [1, -0.03], [1], [3, 0.07]], fractions),
      ]) {
        const result = calculateShareAmounts(total, selected, fractions, payer);
        assert.equal(result.difference.value, 0);
      }
    }
  }
});

await test("share inputs parse and step without going negative", () => {
  assert.equal(parseShares(""), 0);
  assert.equal(parseShares("1,5"), 1.5);
  assert.equal(parseShares("-1"), undefined);
  assert.equal(parseShares("abc"), undefined);
  assert.equal(stepShares("0", 1), "1");
  assert.equal(stepShares("0,1", 1), "1.1");
  assert.equal(stepShares("0.5", -1), "0");
  assert.equal(stepShares("0", -1), "0");
  assert.equal(stepShares("abc", 1), "1");
});

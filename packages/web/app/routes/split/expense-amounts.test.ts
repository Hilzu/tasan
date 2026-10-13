import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { genUserID } from "@tasan/common/id";

import { calculateExpenseAmounts } from "./expense-amounts";

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
  [...result.participants.values()].map((share) => share.value);

await test("starts empty and handles no participants", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([undefined, undefined]),
    0,
    payer,
  );
  assert.equal(result.hasAmounts, false);
  assert.equal(result.amount.value, 0);
  assert.deepEqual(values(result), [0, 0]);
  assert.equal(
    calculateExpenseAmounts(D.create(100, 0), new Map(), 0, payer).difference
      .value,
    100,
  );
});

await test("total first splits equally and specific shares take precedence", () => {
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

await test("shares first calculate the total, including explicit zero", () => {
  const result = calculateExpenseAmounts(
    undefined,
    inputs([2000, 3000, 1500, 2500]),
    0,
    payer,
  );
  assert.equal(result.amount.value, 9000);
  assert.deepEqual(values(result), [2000, 3000, 1500, 2500]);
  assert.equal(result.difference.value, 0);
  assert.deepEqual(
    values(
      calculateExpenseAmounts(
        D.create(100, 0),
        inputs([0, undefined]),
        0,
        payer,
      ),
    ),
    [0, 100],
  );
  assert.deepEqual(
    values(
      calculateExpenseAmounts(undefined, inputs([100, undefined]), 0, payer),
    ),
    [100, 0],
  );
});

await test("changing total, selection, and clearing a share preserves other specific amounts", () => {
  const shares = inputs([1000, undefined, undefined, undefined]);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(7000, 0), shares, 0, payer)),
    [1000, 2000, 2000, 2000],
  );
  shares.delete(fourth);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(7000, 0), shares, 0, payer)),
    [1000, 3000, 3000],
  );
  shares.set(fourth, undefined);
  shares.set(payer, undefined);
  assert.deepEqual(
    values(calculateExpenseAmounts(D.create(10000, 0), shares, 0, payer)),
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

await test("mismatches preserve amounts without negative automatic shares", () => {
  const total = D.create(100, 0);
  const under = calculateExpenseAmounts(total, inputs([40, 50]), 0, payer);
  assert.equal(under.difference.value, 10);
  assert.deepEqual(values(under), [40, 50]);
  const over = calculateExpenseAmounts(
    total,
    inputs([110, undefined]),
    0,
    payer,
  );
  assert.equal(over.difference.value, -10);
  assert.deepEqual(values(over), [110, 0]);
});

await test("JPY and EUR rounding sums to total even when total is smaller than participant count", () => {
  for (const fractions of [0, 2]) {
    for (let units = 1; units <= 200; units++) {
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
    values(calculateExpenseAmounts(D.create(1, 0), noPayer, 0, payer)),
    [1, 0],
  );
});

await test("currency changes round specific shares before calculating remainder", () => {
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

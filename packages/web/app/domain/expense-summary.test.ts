import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import type { SplitExpense } from "@tasan/data";

import { calculateExpenseSummary } from "~/domain/expense-summary";

const you = genUserID();
const other = genUserID();
const expense = (overrides: Partial<SplitExpense> = {}): SplitExpense => ({
  id: genExpenseID(),
  splitID: genSplitID(),
  name: "Dinner",
  amount: D.create(30),
  currency: "EUR",
  payer: you,
  participants: new Map([
    [you, D.create(10)],
    [other, D.create(20)],
  ]),
  createdBy: other,
  createdAt: new Date("2026-10-20T00:00:00Z"),
  ...overrides,
});

await test("empty splits show zero with the home currency precision", () => {
  for (const [currency, fractions] of [
    ["EUR", 2],
    ["JPY", 0],
  ] as const) {
    assert.deepEqual(calculateExpenseSummary([], currency, you), {
      total: D.create(0, fractions),
      paid: D.create(0, fractions),
      share: D.create(0, fractions),
    });
  }
});

await test("counts all spending, distinguishing payer from participant and creator", () => {
  const expenses = [
    expense(),
    expense({
      amount: D.create(12),
      payer: other,
      createdBy: you,
      participants: new Map([[other, D.create(12)]]),
    }),
    expense({
      amount: D.create(15),
      participants: new Map([[other, D.create(15)]]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create(57),
    paid: D.create(45),
    share: D.create(10),
  });
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", other), {
    total: D.create(57),
    paid: D.create(12),
    share: D.create(47),
  });
});

await test("combines home and foreign expenses using their saved conversion rates", () => {
  const expenses = [
    expense(),
    expense({
      amount: D.create(3000, 0),
      currency: "JPY",
      conversionRate: 0.006,
      payer: other,
      participants: new Map([
        [you, D.create(1000, 0)],
        [other, D.create(2000, 0)],
      ]),
    }),
    expense({
      amount: D.create(10),
      currency: "USD",
      conversionRate: 0.9,
      participants: new Map([
        [you, D.create(5)],
        [other, D.create(5)],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create(57),
    paid: D.create(39),
    share: D.create(20.5),
  });
});

await test("converts fractional foreign amounts before rounding to whole yen", () => {
  const expenses = [
    expense({
      amount: D.create(1.5),
      conversionRate: 160,
      participants: new Map([
        [you, D.create(0.75)],
        [other, D.create(0.75)],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "JPY", you), {
    total: D.create(240, 0),
    paid: D.create(240, 0),
    share: D.create(120, 0),
  });
});

await test("rounds converted amounts per expense and sums decimals without drift", () => {
  const expenses = Array.from({ length: 3 }, () =>
    expense({
      amount: D.create(0.15),
      currency: "USD",
      conversionRate: 0.7,
      participants: new Map([[you, D.create(0.15)]]),
    }),
  );
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create(0.33),
    paid: D.create(0.33),
    share: D.create(0.33),
  });
});

await test("repayments do not change any spending totals", () => {
  const spending = expense();
  const repayment = expense({
    kind: "repayment",
    payer: other,
    participants: new Map([[you, D.create(20)]]),
    amount: D.create(20),
  });
  for (const user of [you, other])
    assert.deepEqual(
      calculateExpenseSummary([spending, repayment], "EUR", user),
      calculateExpenseSummary([spending], "EUR", user),
    );
});

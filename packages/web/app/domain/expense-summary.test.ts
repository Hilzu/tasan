import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import * as D from "@tasan/common/money";
import type { SplitExpense } from "@tasan/data";

import { calculateExpenseSummary } from "~/domain/expense-summary";

const you = genUserID();
const other = genUserID();
const expense = (overrides: Partial<SplitExpense> = {}): SplitExpense => ({
  id: genExpenseID(),
  splitID: genSplitID(),
  name: "Dinner",
  amount: D.create("30", "EUR"),
  currency: "EUR",
  payer: you,
  participants: new Map([
    [you, D.create("10", "EUR")],
    [other, D.create("20", "EUR")],
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
      total: D.round(String(0), fractions === 0 ? "JPY" : "EUR"),
      paid: D.round(String(0), fractions === 0 ? "JPY" : "EUR"),
      share: D.round(String(0), fractions === 0 ? "JPY" : "EUR"),
    });
  }
});

await test("counts all spending, distinguishing payer from participant and creator", () => {
  const expenses = [
    expense(),
    expense({
      amount: D.create("12", "EUR"),
      payer: other,
      createdBy: you,
      participants: new Map([[other, D.create("12", "EUR")]]),
    }),
    expense({
      amount: D.create("15", "EUR"),
      participants: new Map([[other, D.create("15", "EUR")]]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create("57", "EUR"),
    paid: D.create("45", "EUR"),
    share: D.create("10", "EUR"),
  });
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", other), {
    total: D.create("57", "EUR"),
    paid: D.create("12", "EUR"),
    share: D.create("47", "EUR"),
  });
});

await test("combines home and foreign expenses using their saved conversion rates", () => {
  const expenses = [
    expense(),
    expense({
      amount: D.create("3000", "JPY"),
      currency: "JPY",
      conversionRate: Rate.create("0.006"),
      payer: other,
      participants: new Map([
        [you, D.create("1000", "JPY")],
        [other, D.create("2000", "JPY")],
      ]),
    }),
    expense({
      amount: D.create("10", "USD"),
      currency: "USD",
      conversionRate: Rate.create("0.9"),
      participants: new Map([
        [you, D.create("5", "USD")],
        [other, D.create("5", "USD")],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create("57", "EUR"),
    paid: D.create("39", "EUR"),
    share: D.create("20.5", "EUR"),
  });
});

await test("converts fractional foreign amounts before rounding to whole yen", () => {
  const expenses = [
    expense({
      amount: D.create("1.5", "EUR"),
      conversionRate: Rate.create("160"),
      participants: new Map([
        [you, D.create("0.75", "EUR")],
        [other, D.create("0.75", "EUR")],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "JPY", you), {
    total: D.create("240", "JPY"),
    paid: D.create("240", "JPY"),
    share: D.create("120", "JPY"),
  });
});

await test("rounds converted amounts per expense and sums decimals without drift", () => {
  const expenses = Array.from({ length: 3 }, () =>
    expense({
      amount: D.create("0.15", "USD"),
      currency: "USD",
      conversionRate: Rate.create("0.7"),
      participants: new Map([[you, D.create("0.15", "USD")]]),
    }),
  );
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: D.create("0.33", "EUR"),
    paid: D.create("0.33", "EUR"),
    share: D.create("0.33", "EUR"),
  });
});

await test("repayments do not change any spending totals", () => {
  const spending = expense();
  const repayment = expense({
    kind: "repayment",
    payer: other,
    participants: new Map([[you, D.create("20", "EUR")]]),
    amount: D.create("20", "EUR"),
  });
  for (const user of [you, other])
    assert.deepEqual(
      calculateExpenseSummary([spending, repayment], "EUR", user),
      calculateExpenseSummary([spending], "EUR", user),
    );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
import type { SplitExpense } from "@tasan/data";

import { calculateExpenseSummary } from "~/domain/expense-summary";

const you = genUserID();
const other = genUserID();
const expense = (overrides: Partial<SplitExpense> = {}): SplitExpense => ({
  id: genExpenseID(),
  splitID: genSplitID(),
  name: "Dinner",
  amount: M.create("30", "EUR"),
  currency: "EUR",
  payer: you,
  participants: new Map([
    [you, M.create("10", "EUR")],
    [other, M.create("20", "EUR")],
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
      total: M.round(String(0), fractions === 0 ? "JPY" : "EUR"),
      paid: M.round(String(0), fractions === 0 ? "JPY" : "EUR"),
      share: M.round(String(0), fractions === 0 ? "JPY" : "EUR"),
    });
  }
});

await test("counts all spending, distinguishing payer from participant and creator", () => {
  const expenses = [
    expense(),
    expense({
      amount: M.create("12", "EUR"),
      payer: other,
      createdBy: you,
      participants: new Map([[other, M.create("12", "EUR")]]),
    }),
    expense({
      amount: M.create("15", "EUR"),
      participants: new Map([[other, M.create("15", "EUR")]]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: M.create("57", "EUR"),
    paid: M.create("45", "EUR"),
    share: M.create("10", "EUR"),
  });
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", other), {
    total: M.create("57", "EUR"),
    paid: M.create("12", "EUR"),
    share: M.create("47", "EUR"),
  });
});

await test("combines home and foreign expenses using their saved conversion rates", () => {
  const expenses = [
    expense(),
    expense({
      amount: M.create("3000", "JPY"),
      currency: "JPY",
      conversionRate: Rate.create("0.006"),
      payer: other,
      participants: new Map([
        [you, M.create("1000", "JPY")],
        [other, M.create("2000", "JPY")],
      ]),
    }),
    expense({
      amount: M.create("10", "USD"),
      currency: "USD",
      conversionRate: Rate.create("0.9"),
      participants: new Map([
        [you, M.create("5", "USD")],
        [other, M.create("5", "USD")],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: M.create("57", "EUR"),
    paid: M.create("39", "EUR"),
    share: M.create("20.5", "EUR"),
  });
});

await test("converts fractional foreign amounts before rounding to whole yen", () => {
  const expenses = [
    expense({
      amount: M.create("1.5", "EUR"),
      conversionRate: Rate.create("160"),
      participants: new Map([
        [you, M.create("0.75", "EUR")],
        [other, M.create("0.75", "EUR")],
      ]),
    }),
  ];
  assert.deepEqual(calculateExpenseSummary(expenses, "JPY", you), {
    total: M.create("240", "JPY"),
    paid: M.create("240", "JPY"),
    share: M.create("120", "JPY"),
  });
});

await test("rounds converted amounts per expense and sums decimals without drift", () => {
  const expenses = Array.from({ length: 3 }, () =>
    expense({
      amount: M.create("0.15", "USD"),
      currency: "USD",
      conversionRate: Rate.create("0.7"),
      participants: new Map([[you, M.create("0.15", "USD")]]),
    }),
  );
  assert.deepEqual(calculateExpenseSummary(expenses, "EUR", you), {
    total: M.create("0.33", "EUR"),
    paid: M.create("0.33", "EUR"),
    share: M.create("0.33", "EUR"),
  });
});

await test("repayments do not change any spending totals", () => {
  const spending = expense();
  const repayment = expense({
    kind: "repayment",
    payer: other,
    participants: new Map([[you, M.create("20", "EUR")]]),
    amount: M.create("20", "EUR"),
  });
  for (const user of [you, other])
    assert.deepEqual(
      calculateExpenseSummary([spending, repayment], "EUR", user),
      calculateExpenseSummary([spending], "EUR", user),
    );
});

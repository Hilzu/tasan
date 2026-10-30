import assert from "node:assert/strict";
import { test } from "node:test";

import { currencies } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import type { SplitExpense } from "@tasan/data";

import { convertExpense } from "~/domain/convert-expense";
import {
  calculateBalances,
  calculateExpenseGraph,
  createGraphWithCurrency,
} from "~/domain/expense-graph";
import { calculateExpenseSummary } from "~/domain/expense-summary";

const users = [genUserID(), genUserID(), genUserID()];
const [payer, second, third] = users;
const expense = (overrides: Partial<SplitExpense> = {}): SplitExpense => ({
  id: genExpenseID(),
  splitID: genSplitID(),
  name: "Foreign expense",
  createdAt: new Date(),
  createdBy: payer,
  payer,
  currency: "USD",
  conversionRate: 0.9,
  amount: D.create(1),
  participants: new Map([
    [payer, D.create(0.34)],
    [second, D.create(0.33)],
    [third, D.create(0.33)],
  ]),
  ...overrides,
});

await test("rounding shares down preserves the converted total and the payer's balance", () => {
  const entry = expense();
  assert.deepEqual(convertExpense(entry, "EUR"), {
    amount: D.create(0.9),
    participants: new Map([
      [payer, D.create(0.3)],
      [second, D.create(0.3)],
      [third, D.create(0.3)],
    ]),
  });
  const summary = calculateExpenseSummary([entry], "EUR", payer);
  assert.deepEqual(summary, {
    total: D.create(0.9),
    paid: D.create(0.9),
    share: D.create(0.3),
  });
  assert.deepEqual(
    calculateBalances(
      createGraphWithCurrency("EUR", [entry]),
      users,
      "EUR",
    ).find((b) => b.userID === payer)?.balance,
    D.create(0.6),
  );
});

await test("converted expense totals round exact decimal half units up", () => {
  for (const [source, rate, currency, expected] of [
    [86500, 0.00565, "EUR", 488.73],
    [300, 0.00565, "EUR", 1.7],
    [2700, 0.00565, "EUR", 15.26],
    [10700, 0.00565, "EUR", 60.46],
    [500, 0.00563, "EUR", 2.82],
    [10000, 5e-7, "EUR", 0.01],
    [1, 0.5, "JPY", 1],
  ] as const) {
    const entry = expense({
      currency: "JPY",
      amount: D.create(source, 0),
      conversionRate: rate,
      participants: new Map([[second, D.create(source, 0)]]),
    });
    const converted = convertExpense(entry, currency);
    const amount = D.create(expected, currencies[currency].fractions);
    assert.deepEqual(converted.amount, amount);
    assert.deepEqual(converted.participants.get(second), amount);
    assert.deepEqual(calculateExpenseSummary([entry], currency, payer), {
      total: amount,
      paid: amount,
      share: D.create(0, amount.fractions),
    });
  }
});

await test("conversion distinguishes exact half units from values just below them", () => {
  for (const [rate, expected] of [
    [1.005, 1.01],
    [1.0049999999999997, 1],
  ]) {
    const entry = expense({
      amount: D.create(1),
      conversionRate: rate,
      participants: new Map([[second, D.create(1)]]),
    });
    assert.deepEqual(convertExpense(entry, "EUR").amount, D.create(expected));
  }
});

await test("rounding remainders favour the payer on ties, independent of participant order", () => {
  const entry = expense({
    amount: D.create(0.03),
    conversionRate: 0.5,
    participants: new Map(users.map((id) => [id, D.create(0.01)])),
  });
  const result = convertExpense(entry, "EUR");
  const [tieWinner, tieLoser] = [second, third].sort();
  assert.deepEqual(result.amount, D.create(0.02));
  assert.deepEqual(result.participants.get(payer), D.create(0.01));
  assert.deepEqual(result.participants.get(tieWinner), D.create(0.01));
  assert.deepEqual(result.participants.get(tieLoser), D.create(0));
  assert.deepEqual(
    convertExpense(
      { ...entry, participants: new Map([...entry.participants].reverse()) },
      "EUR",
    ),
    result,
  );
  assert.deepEqual(
    createGraphWithCurrency("EUR", [entry]),
    new Map([[tieWinner, [{ to: payer, amount: D.create(0.01) }]]]),
  );
});

await test("tiny converted expenses produce no zero-value repayment suggestions", () => {
  const entry = expense({
    amount: D.create(0.01),
    conversionRate: 0.1,
    participants: new Map([[second, D.create(0.01)]]),
  });
  assert.deepEqual(convertExpense(entry, "JPY").amount, D.create(0, 0));
  assert.equal(createGraphWithCurrency("JPY", [entry]).size, 0);
});

await test("distinct decimal remainders are not treated as ties", () => {
  const entry = expense({
    amount: D.create(0.04),
    conversionRate: 0.5000000001,
    participants: new Map([
      [payer, D.create(0.01)],
      [second, D.create(0.03)],
    ]),
  });
  const converted = convertExpense(entry, "EUR");
  assert.deepEqual(converted.amount, D.create(0.02));
  assert.deepEqual(converted.participants.get(payer), D.create(0));
  assert.deepEqual(converted.participants.get(second), D.create(0.02));
});

await test("converted totals, summaries and simplified balances agree across rounding cases", () => {
  for (const currency of ["EUR", "USD", "JPY", "KRW"] as const) {
    const fractions = currencies[currency].fractions;
    const units = (value: D.Decimal) =>
      Math.round(value.value * 10 ** fractions);
    for (const source of ["EUR", "JPY"] as const) {
      for (const rate of [0.006, 0.7, 0.9, 1, 1.234567, 160]) {
        for (let seed = 1; seed <= 30; seed++) {
          const sourceFractions = currencies[source].fractions;
          const sourceUnits = [seed, seed * 3 + 1, seed * 7 + 2];
          const entry = expense({
            currency: source,
            conversionRate: rate,
            amount: D.create(
              sourceUnits.reduce((a, b) => a + b, 0) / 10 ** sourceFractions,
              sourceFractions,
            ),
            payer: seed % 2 ? payer : genUserID(),
            participants: new Map(
              users.map((id, i) => [
                id,
                D.create(
                  sourceUnits[i] / 10 ** sourceFractions,
                  sourceFractions,
                ),
              ]),
            ),
          });
          const before = structuredClone(entry);
          const converted = convertExpense(entry, currency);
          assert.equal(
            [...converted.participants.values()].reduce(
              (sum, share) => sum + units(share),
              0,
            ),
            units(converted.amount),
          );
          for (const [id, share] of converted.participants) {
            const exact =
              (entry.participants.get(id)?.value ?? 0) * rate * 10 ** fractions;
            assert.ok(share.value >= 0);
            assert.ok(Math.abs(units(share) - exact) <= 1 + 1e-9);
          }
          assert.deepEqual(
            convertExpense(
              {
                ...entry,
                participants: new Map([...entry.participants].reverse()),
              },
              currency,
            ),
            converted,
          );
          const allUsers = [...new Set([...users, entry.payer])];
          const balances = calculateBalances(
            calculateExpenseGraph({
              id: entry.splitID,
              name: "Trip",
              currency,
              createdAt: entry.createdAt,
              createdBy: payer,
              userIDs: new Set(allUsers),
              expenses: [entry],
            }),
            allUsers,
            currency,
          );
          for (const { userID, balance } of balances) {
            const summary = calculateExpenseSummary([entry], currency, userID);
            assert.equal(
              units(balance),
              units(summary.paid) - units(summary.share),
            );
          }
          assert.equal(
            balances.reduce((sum, { balance }) => sum + units(balance), 0),
            0,
          );
          assert.deepEqual(entry, before);
        }
      }
    }
  }
});

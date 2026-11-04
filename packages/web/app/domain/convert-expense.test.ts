import assert from "node:assert/strict";
import { test } from "node:test";

import { currencies } from "@tasan/common/currency";
import * as Rate from "@tasan/common/exchange-rate";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
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
  currency: overrides.amount?.currency ?? "USD",
  conversionRate: Rate.create("0.9"),
  amount: M.create("1", "USD"),
  participants: new Map([
    [payer, M.create("0.34", "USD")],
    [second, M.create("0.33", "USD")],
    [third, M.create("0.33", "USD")],
  ]),
  ...overrides,
});

await test("rounding shares down preserves the converted total and the payer's balance", () => {
  const entry = expense();
  assert.deepEqual(convertExpense(entry, "EUR"), {
    amount: M.create("0.9", "EUR"),
    participants: new Map([
      [payer, M.create("0.3", "EUR")],
      [second, M.create("0.3", "EUR")],
      [third, M.create("0.3", "EUR")],
    ]),
  });
  const summary = calculateExpenseSummary([entry], "EUR", payer);
  assert.deepEqual(summary, {
    total: M.create("0.9", "EUR"),
    paid: M.create("0.9", "EUR"),
    share: M.create("0.3", "EUR"),
  });
  assert.deepEqual(
    calculateBalances(
      createGraphWithCurrency("EUR", [entry]),
      users,
      "EUR",
    ).find((b) => b.userID === payer)?.balance,
    M.create("0.6", "EUR"),
  );
});

await test("valid expenses can produce summaries and debts wider than storage precision", () => {
  const largest = `${"9".repeat(38)}${"0".repeat(88)}`;
  for (const amounts of [
    ["1e36", "0.01"],
    [largest, largest],
  ]) {
    const entries = amounts.map((text) => {
      const amount = M.create(text, "EUR");
      return expense({
        currency: "EUR",
        conversionRate: undefined,
        amount,
        participants: new Map([[second, amount]]),
      });
    });
    const units = entries.reduce(
      (sum, entry) => sum + entry.amount.minorUnits,
      0n,
    );
    const summary = calculateExpenseSummary(entries, "EUR", payer);
    assert.equal(summary.total.minorUnits, units);
    assert.equal(summary.paid.minorUnits, units);
    assert.equal(
      calculateExpenseSummary(entries, "EUR", second).share.minorUnits,
      units,
    );
    const graph = createGraphWithCurrency("EUR", entries);
    assert.equal(graph.get(second)?.[0].amount.minorUnits, units);
    for (const debts of [
      graph,
      calculateExpenseGraph({
        id: genSplitID(),
        name: "Wide totals",
        currency: "EUR",
        createdAt: new Date(),
        createdBy: payer,
        expenses: entries,
        userIDs: new Set(users),
      }),
    ]) {
      const balances = new Map(
        calculateBalances(debts, users, "EUR").map(({ userID, balance }) => [
          userID,
          balance.minorUnits,
        ]),
      );
      assert.equal(balances.get(payer), units);
      assert.equal(balances.get(second), -units);
      assert.equal(balances.get(third), 0n);
    }
  }
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
      amount: M.round(String(source), "JPY"),
      conversionRate: Rate.create(String(rate)),
      participants: new Map([[second, M.round(String(source), "JPY")]]),
    });
    const converted = convertExpense(entry, currency);
    const amount = M.round(
      String(expected),
      currencies[currency].fractions === 0 ? "JPY" : "EUR",
    );
    assert.deepEqual(converted.amount, amount);
    assert.deepEqual(converted.participants.get(second), amount);
    assert.deepEqual(calculateExpenseSummary([entry], currency, payer), {
      total: amount,
      paid: amount,
      share: M.round(String(0), amount.currency),
    });
  }
});

await test("conversion distinguishes exact half units from values just below them", () => {
  for (const [rate, expected] of [
    [1.005, 1.01],
    [1.0049999999999997, 1],
  ]) {
    const entry = expense({
      amount: M.create("1", "EUR"),
      conversionRate: Rate.create(String(rate)),
      participants: new Map([[second, M.create("1", "EUR")]]),
    });
    assert.deepEqual(
      convertExpense(entry, "EUR").amount,
      M.round(String(expected), "EUR"),
    );
  }
});

await test("rounding remainders favour the payer on ties, independent of participant order", () => {
  const entry = expense({
    amount: M.create("0.03", "EUR"),
    conversionRate: Rate.create("0.5"),
    participants: new Map(users.map((id) => [id, M.create("0.01", "EUR")])),
  });
  const result = convertExpense(entry, "EUR");
  const [tieWinner, tieLoser] = [second, third].sort();
  assert.deepEqual(result.amount, M.create("0.02", "EUR"));
  assert.deepEqual(result.participants.get(payer), M.create("0.01", "EUR"));
  assert.deepEqual(result.participants.get(tieWinner), M.create("0.01", "EUR"));
  assert.deepEqual(result.participants.get(tieLoser), M.create("0", "EUR"));
  const reversed = new Map([...entry.participants].reverse());
  const reordered = convertExpense({ ...entry, participants: reversed }, "EUR");
  assert.deepEqual(reordered, result);
  assert.deepEqual([...reordered.participants.keys()], [...reversed.keys()]);
  assert.deepEqual(
    createGraphWithCurrency("EUR", [entry]),
    new Map([[tieWinner, [{ to: payer, amount: M.create("0.01", "EUR") }]]]),
  );
});

await test("tiny converted expenses produce no zero-value repayment suggestions", () => {
  const entry = expense({
    amount: M.create("0.01", "EUR"),
    conversionRate: Rate.create("0.1"),
    participants: new Map([[second, M.create("0.01", "EUR")]]),
  });
  assert.deepEqual(convertExpense(entry, "JPY").amount, M.create("0", "JPY"));
  assert.equal(createGraphWithCurrency("JPY", [entry]).size, 0);
});

await test("distinct decimal remainders are not treated as ties", () => {
  const entry = expense({
    amount: M.create("0.04", "EUR"),
    conversionRate: Rate.create("0.5000000001"),
    participants: new Map([
      [payer, M.create("0.01", "EUR")],
      [second, M.create("0.03", "EUR")],
    ]),
  });
  const converted = convertExpense(entry, "EUR");
  assert.deepEqual(converted.amount, M.create("0.02", "EUR"));
  assert.deepEqual(converted.participants.get(payer), M.create("0", "EUR"));
  assert.deepEqual(converted.participants.get(second), M.create("0.02", "EUR"));
});

await test("converted totals, summaries and simplified balances agree across rounding cases", () => {
  for (const currency of ["EUR", "USD", "JPY", "KRW"] as const) {
    const fractions = currencies[currency].fractions;
    const units = (value: M.Money) =>
      Math.round(Number(M.toString(value)) * 10 ** fractions);
    for (const source of ["EUR", "JPY"] as const) {
      for (const rate of [0.006, 0.7, 0.9, 1, 1.234567, 160]) {
        for (let seed = 1; seed <= 30; seed++) {
          const sourceFractions = currencies[source].fractions;
          const sourceUnits = [seed, seed * 3 + 1, seed * 7 + 2];
          const entry = expense({
            currency: source,
            conversionRate: Rate.create(String(rate)),
            amount: M.round(
              String(
                sourceUnits.reduce((a, b) => a + b, 0) / 10 ** sourceFractions,
              ),
              sourceFractions === 0 ? "JPY" : "EUR",
            ),
            payer: seed % 2 ? payer : genUserID(),
            participants: new Map(
              users.map((id, i) => [
                id,
                M.round(
                  String(sourceUnits[i] / 10 ** sourceFractions),
                  sourceFractions === 0 ? "JPY" : "EUR",
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
              ((entry.participants.get(id) &&
                Number(
                  M.toString(
                    entry.participants.get(id) ?? M.create("0", source),
                  ),
                )) ??
                0) *
              rate *
              10 ** fractions;
            assert.ok(Number(M.toString(share)) >= 0);
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

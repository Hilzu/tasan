import assert from "node:assert/strict";
import { test } from "node:test";

import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { Graph } from "@tasan/common/graph";
import type { UserID } from "@tasan/common/id";

import { calculateBalances, simplifyDebts } from "~/domain/expense-graph";

// Integer accounting is independent of both the production balance calculator
// and its decimal arithmetic, so the two cannot hide the same rounding error.
const minorUnits = (amount: D.Decimal, fractions: number) =>
  BigInt(amount.value.toFixed(fractions).replace(".", ""));

const account = (graph: Graph, users: UserID[], fractions: number) => {
  const balances = new Map(users.map((id) => [id, 0n]));
  for (const [from, edges] of graph) {
    for (const { to, amount } of edges) {
      const units = minorUnits(amount, fractions);
      balances.set(from, (balances.get(from) ?? 0n) - units);
      balances.set(to, (balances.get(to) ?? 0n) + units);
    }
  }
  return balances;
};

const verify = (graph: Graph, currency: CurrencySymbol) => {
  const fractions = currencies[currency].fractions;
  const original = structuredClone(graph);
  const expected = account(graph, [], fractions);
  const users = [...expected.keys()];
  const result = simplifyDebts(graph, currency);
  assert.deepEqual(account(result, users, fractions), expected);
  assert.equal(
    [...expected.values()].reduce((sum, value) => sum + value, 0n),
    0n,
  );

  for (const candidate of [graph, result]) {
    assert.deepEqual(
      new Map(
        calculateBalances(candidate, users, currency).map(
          ({ userID, balance }) => [userID, minorUnits(balance, fractions)],
        ),
      ),
      expected,
    );
  }

  const outstanding = new Map(expected);
  let payments = 0;
  for (const [from, edges] of result) {
    const recipients = new Set<UserID>();
    for (const { to, amount } of edges) {
      payments++;
      assert.notEqual(from, to);
      assert.ok(!recipients.has(to), "No duplicate payment pairs");
      recipients.add(to);
      assert.ok(Number.isFinite(amount.value) && amount.value > 0);
      assert.equal(amount.fractions, fractions);
      assert.ok((expected.get(from) ?? 0n) < 0n, "Only net debtors pay");
      assert.ok((expected.get(to) ?? 0n) > 0n, "Only net creditors receive");
      const units = minorUnits(amount, fractions);
      assert.ok(units > 0n);
      outstanding.set(from, (outstanding.get(from) ?? 0n) + units);
      outstanding.set(to, (outstanding.get(to) ?? 0n) - units);
    }
  }
  assert.ok(
    [...outstanding.values()].every((value) => value === 0n),
    "Executing all payments settles everyone exactly",
  );
  const nonzero = [...expected.values()].filter((value) => value !== 0n).length;
  assert.ok(payments <= Math.max(0, nonzero - 1));
  assert.deepEqual(graph, original, "The original debts are not mutated");
  assert.deepEqual(
    simplifyDebts(result, currency),
    result,
    "Simplification is idempotent",
  );
  assert.deepEqual(
    simplifyDebts(
      new Map(
        [...graph]
          .reverse()
          .map(([from, edges]) => [from, [...edges].reverse()]),
      ),
      currency,
    ),
    result,
    "Input order does not affect the plan",
  );
};

const testUser = (index: number) => `usr_${String(index)}` as UserID;

await test("exhaustive integer accounting for all 3-person graphs with edge weights -2 to 2", () => {
  // Six directed edges, each with five possible weights: 15,625 graphs per
  // precision. Includes mutual debts, cycles, chains, zeroes and signed edges.
  for (const currency of ["EUR", "JPY"] as const) {
    const fractions = currencies[currency].fractions;
    for (let code = 0; code < 5 ** 6; code++) {
      let remaining = code;
      const graph: Graph = new Map();
      for (let from = 0; from < 3; from++) {
        for (let to = 0; to < 3; to++) {
          if (from === to) continue;
          const units = (remaining % 5) - 2;
          remaining = Math.floor(remaining / 5);
          const edges = graph.get(testUser(from)) ?? [];
          edges.push({
            to: testUser(to),
            amount: D.create(units / 10 ** fractions, fractions),
          });
          graph.set(testUser(from), edges);
        }
      }
      verify(graph, currency);
    }
  }
});

await test("seeded larger graphs preserve exact balances in every supported currency", () => {
  let state = 0x74617361;
  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
  for (const currency of Object.keys(currencies) as CurrencySymbol[]) {
    const fractions = currencies[currency].fractions;
    for (let iteration = 0; iteration < 100; iteration++) {
      const people = 2 + random(31);
      const graph: Graph = new Map();
      const count = random(301);
      for (let index = 0; index < count; index++) {
        const from = testUser(random(people));
        const to = testUser(random(people));
        const edges = graph.get(from) ?? [];
        edges.push({
          to,
          amount: D.create(
            (random(2_000_001) - 1_000_000) / 10 ** fractions,
            fractions,
          ),
        });
        graph.set(from, edges);
      }
      verify(graph, currency);
    }
  }
});

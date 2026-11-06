import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import { genExpenseID, genSplitID, type UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
import type { SplitExpense } from "@tasan/data";

import {
  calculateBalances,
  calculateExpenseGraph,
  createGraphWithCurrency,
  simplifyDebts,
} from "~/domain/expense-graph";
import { calculateExpenseSummary } from "~/domain/expense-summary";

const numberGen = function* () {
  let i = 0;
  while (true) {
    yield i++;
  }
};
const genTestUserID = (tag: string) => `usr_${tag}` as UserID;
interface CreateTestExpenseOpts {
  payer: UserID;
  amount: M.Money;
  participants: Record<UserID, M.Money>;
  conversionRate?: Rate.ExchangeRate;
}
const createTestExpense = ({
  payer,
  amount,
  participants,
  conversionRate,
}: CreateTestExpenseOpts) => {
  return {
    id: genExpenseID(),
    splitID: genSplitID(),
    name: `Test expense ${numberGen().next().value.toString()}`,
    amount,
    createdBy: genTestUserID("createdBy"),
    createdAt: new Date(),
    currency: "EUR",
    conversionRate,
    payer: payer,
    participants: new Map(Object.entries(participants)) as Map<UserID, M.Money>,
  } satisfies SplitExpense;
};
await test("createGraphWithCurrency", async (t) => {
  await t.test("creates a graph with no expenses", () => {
    const graph = createGraphWithCurrency("EUR", []);
    assert.deepEqual(graph, new Map());
  });
  await t.test("creates a graph with one expense", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const graph = createGraphWithCurrency("EUR", [
      createTestExpense({
        payer: userA,
        amount: M.create("10", "EUR"),
        participants: { [userB]: M.create("10", "EUR") },
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([[userB, [{ to: userA, amount: M.create("10", "EUR") }]]]),
    );
  });
  await t.test("creates a graph with several expenses", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const userC = genTestUserID("c");
    const graph = createGraphWithCurrency("EUR", [
      createTestExpense({
        payer: userA,
        amount: M.create("12", "EUR"),
        participants: {
          [userB]: M.create("4", "EUR"),
          [userC]: M.create("8", "EUR"),
        },
      }),
      createTestExpense({
        payer: userB,
        amount: M.create("15", "EUR"),
        participants: {
          [userA]: M.create("10", "EUR"),
          [userC]: M.create("5", "EUR"),
        },
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([
        [userA, [{ to: userB, amount: M.create("10", "EUR") }]],
        [userB, [{ to: userA, amount: M.create("4", "EUR") }]],
        [
          userC,
          [
            { to: userA, amount: M.create("8", "EUR") },
            { to: userB, amount: M.create("5", "EUR") },
          ],
        ],
      ]),
    );
  });
  await t.test("creates a graph with currency conversion", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const graph = createGraphWithCurrency("USD", [
      createTestExpense({
        payer: userA,
        amount: M.create("10", "EUR"),
        participants: { [userB]: M.create("10", "EUR") },
        conversionRate: Rate.create("1.666666"),
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([[userB, [{ to: userA, amount: M.create("16.67", "USD") }]]]),
    );
  });
  await t.test(
    "converts foreign fractions before rounding to home currency",
    () => {
      const debtor = genTestUserID("debtor");
      const payer = genTestUserID("payer");
      for (const [currency, source, conversionRate, expected] of [
        ["JPY", 1.49, 160, 238],
        ["JPY", 1.5, 160, 240],
        ["JPY", 0.01, 160, 2],
        ["KRW", 1.49, 1500, 2235],
        ["USD", 1.49, 1.234567, 1.84],
        ["EUR", 0.15, 0.7, 0.11],
      ] as const) {
        const expense = createTestExpense({
          payer,
          amount: M.round(String(source), "EUR"),
          participants: { [debtor]: M.round(String(source), "EUR") },
          conversionRate: Rate.create(String(conversionRate)),
        });
        const before = structuredClone(expense);
        const amount = M.round(String(expected), currency);
        const expectedGraph = new Map([[debtor, [{ to: payer, amount }]]]);
        assert.deepEqual(
          createGraphWithCurrency(currency, [expense]),
          expectedGraph,
        );
        const graph = calculateExpenseGraph({
          id: expense.splitID,
          name: "Foreign expense",
          currency,
          createdAt: new Date(),
          createdBy: payer,
          userIDs: new Set([payer, debtor]),
          expenses: [expense],
        });
        assert.deepEqual(graph, expectedGraph);
        for (const { userID, balance } of calculateBalances(
          graph,
          [payer, debtor],
          currency,
        )) {
          const summary = calculateExpenseSummary([expense], currency, userID);
          assert.deepEqual(balance, M.sub(summary.paid, summary.share));
        }
        assert.deepEqual(expense, before);
      }
    },
  );
});

await test("simplifyDebts", async (t) => {
  await t.test("cancels mutual debts", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const graph = new Map([
      [userA, [{ to: userB, amount: M.create("10", "EUR") }]],
      [userB, [{ to: userA, amount: M.create("5", "EUR") }]],
    ]);
    const newGraph = simplifyDebts(graph, "EUR");
    assert.deepEqual(
      newGraph,
      new Map([[userA, [{ to: userB, amount: M.create("5", "EUR") }]]]),
    );
  });
  await t.test("cancels mutual debts with multiple participants", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const userC = genTestUserID("c");
    const graph = new Map([
      [
        userA,
        [
          { to: userB, amount: M.create("10", "EUR") },
          { to: userC, amount: M.create("5", "EUR") },
        ],
      ],
      [userB, [{ to: userA, amount: M.create("5", "EUR") }]],
      [userC, [{ to: userA, amount: M.create("2", "EUR") }]],
    ]);
    const newGraph = simplifyDebts(graph, "EUR");
    assert.deepEqual(
      newGraph,
      new Map([
        [
          userA,
          [
            { to: userB, amount: M.create("5", "EUR") },
            { to: userC, amount: M.create("3", "EUR") },
          ],
        ],
      ]),
    );
  });
});

await test("calculateBalances", async (t) => {
  await t.test("gives everyone a zero balance with no debts", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    assert.deepEqual(calculateBalances(new Map(), [userB, userA], "EUR"), [
      { userID: userA, balance: M.create("0", "EUR") },
      { userID: userB, balance: M.create("0", "EUR") },
    ]);
  });
  await t.test("sorts the user most in the red first", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const userC = genTestUserID("c");
    const userD = genTestUserID("d");
    const graph = new Map([
      [userA, [{ to: userC, amount: M.create("5", "EUR") }]],
      [
        userB,
        [
          { to: userC, amount: M.create("10", "EUR") },
          { to: userA, amount: M.create("2", "EUR") },
        ],
      ],
    ]);
    assert.deepEqual(
      calculateBalances(graph, [userA, userB, userC, userD], "EUR"),
      [
        { userID: userB, balance: M.create("-12", "EUR") },
        { userID: userA, balance: M.create("-3", "EUR") },
        { userID: userD, balance: M.create("0", "EUR") },
        { userID: userC, balance: M.create("15", "EUR") },
      ],
    );
  });
});

await test("simplified repayment plans", async (t) => {
  const a = genTestUserID("a");
  const b = genTestUserID("b");
  const c = genTestUserID("c");
  const d = genTestUserID("d");
  const users = [a, b, c, d];
  for (const { name, currency, edges, expected } of [
    { name: "empty split", currency: "EUR", edges: [], expected: [] },
    {
      name: "chain",
      currency: "EUR",
      edges: [
        [a, b, 30],
        [b, c, 30],
      ],
      expected: [[a, c, 30]],
    },
    {
      name: "cycle",
      currency: "EUR",
      edges: [
        [a, b, 30],
        [b, c, 30],
        [c, a, 30],
      ],
      expected: [],
    },
    {
      name: "equal mutual debts",
      currency: "EUR",
      edges: [
        [a, b, 30],
        [b, a, 30],
      ],
      expected: [],
    },
    {
      name: "largest remaining balances are matched again after each payment",
      currency: "EUR",
      edges: [
        [a, c, 8],
        [a, d, 1],
        [b, d, 7],
      ],
      expected: [
        [a, c, 8],
        [b, d, 7],
        [a, d, 1],
      ],
    },
    {
      name: "cent precision",
      currency: "EUR",
      edges: [
        [a, b, 0.1],
        [b, c, 0.3],
      ],
      expected: [
        [b, c, 0.2],
        [a, c, 0.1],
      ],
    },
    {
      name: "ties use user IDs regardless of original debt order",
      currency: "EUR",
      edges: [
        [b, c, 10],
        [a, d, 10],
      ],
      expected: [
        [a, c, 10],
        [b, d, 10],
      ],
    },
    {
      name: "yen precision",
      currency: "JPY",
      edges: [
        [a, b, 301],
        [b, c, 201],
      ],
      expected: [
        [a, c, 201],
        [a, b, 100],
      ],
    },
    {
      name: "zero-value edges",
      currency: "EUR",
      edges: [[a, b, 0]],
      expected: [],
    },
    {
      name: "negative adjustment",
      currency: "EUR",
      edges: [[a, b, -5]],
      expected: [[b, a, 5]],
    },
  ] satisfies {
    name: string;
    currency: "EUR" | "JPY";
    edges: [UserID, UserID, number][];
    expected: [UserID, UserID, number][];
  }[]) {
    await t.test(name, () => {
      const graph = new Map<
        UserID,
        {
          to: UserID;
          amount: M.Money;
        }[]
      >();
      const fractions = currency === "JPY" ? 0 : 2;
      for (const [from, to, amount] of edges) {
        graph.set(from, [
          ...(graph.get(from) ?? []),
          {
            to,
            amount: M.round(String(amount), fractions === 0 ? "JPY" : "EUR"),
          },
        ]);
      }
      const before = structuredClone(graph);
      const result = simplifyDebts(graph, currency);
      const payments = [...result].flatMap(([from, debts]) =>
        debts.map(({ to, amount }) => [from, to, Number(M.toString(amount))]),
      );
      const normalize = (items: unknown[][]) =>
        items.sort((x, y) =>
          JSON.stringify(x).localeCompare(JSON.stringify(y)),
        );
      assert.deepEqual(normalize(payments), normalize(expected));
      assert.deepEqual(
        calculateBalances(result, users, currency),
        calculateBalances(graph, users, currency),
      );
      assert.deepEqual(graph, before);
      assert.deepEqual(
        simplifyDebts(
          new Map(
            [...graph]
              .reverse()
              .map(([from, debts]) => [from, [...debts].reverse()]),
          ),
          currency,
        ),
        result,
      );
      const active = calculateBalances(graph, users, currency).filter(
        ({ balance }) => !M.equals(balance, 0),
      ).length;
      assert.ok(payments.length <= Math.max(0, active - 1));
    });
  }
  await t.test("converted expenses use simplified repayments", () => {
    const expenses = [
      createTestExpense({
        payer: b,
        amount: M.create("10", "EUR"),
        participants: { [a]: M.create("10", "EUR") },
        conversionRate: Rate.create("1.666666"),
      }),
      createTestExpense({
        payer: c,
        amount: M.create("10", "EUR"),
        participants: { [b]: M.create("10", "EUR") },
        conversionRate: Rate.create("1.666666"),
      }),
    ];
    assert.deepEqual(
      calculateExpenseGraph({
        id: genSplitID(),
        name: "Converted split",
        createdBy: a,
        createdAt: new Date(),
        userIDs: new Set(users),
        currency: "EUR",
        expenses,
      }),
      new Map([[a, [{ to: c, amount: M.create("16.67", "EUR") }]]]),
    );
  });
});

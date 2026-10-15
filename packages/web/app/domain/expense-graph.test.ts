import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { genExpenseID, genSplitID, type UserID } from "@tasan/common/id";
import type { SplitExpense } from "@tasan/data";

import { cancelMutual, createGraphWithCurrency } from "~/domain/expense-graph";

const numberGen = function* () {
  let i = 0;
  while (true) {
    yield i++;
  }
};

const genTestUserID = (tag: string) => `usr_${tag}` as UserID;

interface CreateTestExpenseOpts {
  payer: UserID;
  amount: D.Decimal;
  participants: Record<UserID, D.Decimal>;
  conversionRate?: number;
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
    participants: new Map(Object.entries(participants)) as Map<
      UserID,
      D.Decimal
    >,
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
        amount: D.create(10),
        participants: { [userB]: D.create(10) },
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([[userB, [{ to: userA, amount: D.create(10) }]]]),
    );
  });

  await t.test("creates a graph with several expenses", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");
    const userC = genTestUserID("c");
    const graph = createGraphWithCurrency("EUR", [
      createTestExpense({
        payer: userA,
        amount: D.create(12),
        participants: { [userB]: D.create(4), [userC]: D.create(8) },
      }),
      createTestExpense({
        payer: userB,
        amount: D.create(15),
        participants: { [userA]: D.create(10), [userC]: D.create(5) },
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([
        [userA, [{ to: userB, amount: D.create(10) }]],
        [userB, [{ to: userA, amount: D.create(4) }]],
        [
          userC,
          [
            { to: userA, amount: D.create(8) },
            { to: userB, amount: D.create(5) },
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
        amount: D.create(10),
        participants: { [userB]: D.create(10) },
        conversionRate: 1.666666,
      }),
    ]);
    assert.deepEqual(
      graph,
      new Map([[userB, [{ to: userA, amount: D.create(16.67) }]]]),
    );
  });
});

await test("cancelMutual", async (t) => {
  await t.test("cancels mutual debts", () => {
    const userA = genTestUserID("a");
    const userB = genTestUserID("b");

    const graph = new Map([
      [userA, [{ to: userB, amount: D.create(10) }]],
      [userB, [{ to: userA, amount: D.create(5) }]],
    ]);
    const newGraph = cancelMutual(graph);
    assert.deepEqual(
      newGraph,
      new Map([[userA, [{ to: userB, amount: D.create(5) }]]]),
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
          { to: userB, amount: D.create(10) },
          { to: userC, amount: D.create(5) },
        ],
      ],
      [userB, [{ to: userA, amount: D.create(5) }]],
      [userC, [{ to: userA, amount: D.create(2) }]],
    ]);

    const newGraph = cancelMutual(graph);
    assert.deepEqual(
      newGraph,
      new Map([
        [
          userA,
          [
            { to: userB, amount: D.create(5) },
            { to: userC, amount: D.create(3) },
          ],
        ],
      ]),
    );
  });
});

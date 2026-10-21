import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import type { SplitExpense, SplitWithData } from "@tasan/data";

import {
  calculateBalances,
  calculateExpenseGraph,
} from "~/domain/expense-graph";

await test("recording simplified payments settles indirect debts and deleting restores them", () => {
  const [a, b, c] = [genUserID(), genUserID(), genUserID()];
  const split: SplitWithData = {
    id: genSplitID(),
    name: "Trip",
    currency: "EUR",
    createdAt: new Date(),
    createdBy: a,
    userIDs: new Set([a, b, c]),
    expenses: [],
  };
  const entry = (
    payer: typeof a,
    recipient: typeof a,
    amount: number,
    kind: SplitExpense["kind"] = "expense",
  ): SplitExpense => ({
    id: genExpenseID(),
    splitID: split.id,
    name: "Payment",
    currency: "EUR",
    createdAt: new Date(),
    createdBy: a,
    kind,
    payer,
    amount: D.create(amount, 2),
    participants: new Map([[recipient, D.create(amount, 2)]]),
  });
  // A owes B and B owes C. Simplification asks A to pay C directly.
  split.expenses = [entry(b, a, 25), entry(c, b, 25)];
  const original = calculateExpenseGraph(split);
  assert.deepEqual([...original], [[a, [{ to: c, amount: D.create(25, 2) }]]]);
  split.expenses.push(entry(a, c, 10, "repayment"));
  assert.deepEqual(
    calculateBalances(calculateExpenseGraph(split), [a, b, c], "EUR").map(
      (x) => [x.userID, x.balance.value],
    ),
    [
      [a, -15],
      [b, 0],
      [c, 15],
    ],
  );
  split.expenses.push(entry(a, c, 15, "repayment"));
  assert.equal(calculateExpenseGraph(split).size, 0);
  split.expenses.splice(2);
  assert.deepEqual(calculateExpenseGraph(split), original);
});

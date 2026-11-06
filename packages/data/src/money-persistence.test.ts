import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import {
  genExpenseID,
  genOperationID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";
import * as Money from "@tasan/common/money";

import { DataIntegrityError } from "./errors.js";

process.env.TABLE_NAME = "TestTable";
process.env.AWS_REGION = "eu-west-1";
process.env.AWS_ACCESS_KEY_ID = "test-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
const { dynamoClient } = await import("./client.js");
const {
  createSplitExpense,
  editSplitExpense,
  deleteSplitExpense,
  getSplitExpense,
  findExpenseRevisions,
  expensesFromItems,
} = await import("./models/split-expense.js");

const user = genUserID();
const legacyItem = {
  pk: genSplitID(),
  sk: genExpenseID(),
  name: "Legacy",
  createdAt: new Date().toISOString(),
  createdBy: user,
  currency: "JPY",
  amount: 1234,
  payer: user,
  participants: { [user]: 1234 },
  conversionRate: 0.006,
};
afterEach(() => {
  mock.restoreAll();
});

await test("real SDK round trips amounts and rates as exact DynamoDB numbers", async () => {
  const splitID = genSplitID();
  const id = genExpenseID();
  const amount = Money.create("999999999999.99", "EUR");
  const rate = Rate.create(String(0.012345678901234567));
  const items: Record<string, Record<string, unknown>> = {};
  mock.method(
    dynamoClient().config.requestHandler,
    "handle",
    (request: unknown) => {
      assert.ok(
        request &&
          typeof request === "object" &&
          "body" in request &&
          "headers" in request,
      );
      const payload = JSON.parse(String(request.body)) as {
        Item?: Record<string, unknown>;
        Key?: { sk: { S: string } };
      };
      const target = (request.headers as Record<string, string>)[
        "x-amz-target"
      ];
      let result: unknown = {};
      if (target.endsWith("PutItem")) {
        const item = payload.Item as {
          sk: { S: string };
          amount: { N: string };
          participants: { M: Record<string, { N: string }> };
          conversionRate: { N: string };
        };
        assert.deepEqual(item.amount, { N: "999999999999.99" });
        assert.deepEqual(item.participants.M[user], { N: "999999999999.99" });
        assert.deepEqual(item.conversionRate, { N: rate });
        items[item.sk.S] = item;
      } else if (target.endsWith("GetItem"))
        result = { Item: payload.Key && items[payload.Key.sk.S] };
      else result = { Items: Object.values(items) };
      return Promise.resolve({
        response: {
          statusCode: 200,
          headers: {},
          body: new TextEncoder().encode(JSON.stringify(result)),
        },
      });
    },
  );
  const expense = {
    id,
    splitID,
    name: "Exact expense",
    currency: "EUR" as const,
    amount,
    conversionRate: rate,
    payer: user,
    createdBy: user,
    participants: new Map([[user, amount]]),
  };
  await createSplitExpense(expense);
  const stored = await getSplitExpense(splitID, id);
  assert.ok(stored);
  assert.deepEqual(stored.amount, amount);
  assert.equal(stored.conversionRate, rate);
  assert.deepEqual(stored.participants.get(user), amount);
  await editSplitExpense(splitID, id, user, genOperationID(), () =>
    Promise.resolve({ ...expense, name: "Edited" }),
  );
  assert.equal((await findExpenseRevisions(splitID, id)).length, 2);
  await deleteSplitExpense(splitID, id, user, genOperationID());
  assert.equal(await getSplitExpense(splitID, id), undefined);
  assert.equal((await findExpenseRevisions(splitID, id)).length, 3);
});

await test("reads require exact amounts whose participants sum to the total", () => {
  const [expense] = expensesFromItems([legacyItem]);
  assert.deepEqual(expense.amount, Money.create("1234", "JPY"));
  assert.equal(expense.conversionRate, "0.006");
  const other = genUserID();
  for (const change of [
    { amount: 1234.5, participants: { [user]: 1234.5 } },
    { amount: 1e21, participants: { [user]: 1e21 } },
    { participants: { [user]: 1000, [other]: 200 } },
    { conversionRate: 0 },
    { conversionRate: 1e-7 },
  ])
    assert.throws(
      () => expensesFromItems([{ ...legacyItem, ...change }]),
      DataIntegrityError,
      JSON.stringify(change),
    );
});

await test("amounts that a JS number cannot hold exactly are never written", async () => {
  const send = mock.method(
    dynamoClient().config.requestHandler,
    "handle",
    () => {
      assert.fail("Inexact amounts must be rejected before a DynamoDB request");
    },
  );
  for (const text of ["71364075322780.93", "1000000000000000000000.01"]) {
    const amount = Money.create(text, "EUR");
    await assert.rejects(
      () =>
        createSplitExpense({
          id: genExpenseID(),
          splitID: genSplitID(),
          name: "Inexact amount",
          currency: "EUR",
          amount,
          payer: user,
          createdBy: user,
          participants: new Map([[user, amount]]),
        }),
      RangeError,
      text,
    );
  }
  assert.equal(send.mock.callCount(), 0);
});

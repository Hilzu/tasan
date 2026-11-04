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
afterEach(() => {
  mock.restoreAll();
});

await test("real SDK round trips exact decimals through unchanged DynamoDB Number attributes", async () => {
  const user = genUserID();
  const splitID = genSplitID();
  const id = genExpenseID();
  const amount = Money.create("9007199254740993.01", "EUR");
  const rate = Rate.create("0.12345678901234567890123456789012345678");
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
      assert.equal(typeof request.body, "string");
      const payload = JSON.parse(String(request.body)) as {
        Item?: Record<string, unknown>;
        Key?: { sk: { S: string } };
      };
      const headers = request.headers as Record<string, string>;
      let result: unknown = {};
      if (headers["x-amz-target"].endsWith("PutItem")) {
        assert.ok(payload.Item);
        const item = payload.Item as {
          sk: { S: string };
          amount: { N: string };
          participants: { M: Record<string, { N: string }> };
          conversionRate: { N: string };
        };
        assert.deepEqual(item.amount, { N: "9007199254740993.01" });
        assert.deepEqual(item.participants.M[user], {
          N: "9007199254740993.01",
        });
        assert.deepEqual(item.conversionRate, { N: rate });
        items[item.sk.S] = item;
      } else if (headers["x-amz-target"].endsWith("GetItem"))
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

await test("legacy numeric records remain readable and malformed amounts become integrity errors", () => {
  const user = genUserID();
  const item = {
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
  const [expense] = expensesFromItems([item]);
  assert.deepEqual(expense.amount, Money.create("1234", "JPY"));
  assert.equal(expense.conversionRate, "0.006");
  for (const amount of ["not a decimal", "Infinity", "1e126"])
    assert.throws(
      () => expensesFromItems([{ ...item, amount }]),
      DataIntegrityError,
    );
});

await test("legacy fractional shares conserve the rounded total without rewriting snapshots", () => {
  const users = [genUserID(), genUserID()].sort();
  for (const [currency, total, shares] of [
    ["EUR", "0.02", ["0.015", "0.005"]],
    ["EUR", "0.01", ["0.005", "0.005"]],
    ["JPY", "2", ["1.5", "0.5"]],
    ["EUR", "0.3", ["0.1", "0.20000000000000004"]],
    ["EUR", "0.01", ["-0.005", "0.015"]],
    ["EUR", "1.00", ["1.005", "0"]],
  ] as const) {
    const item = {
      pk: genSplitID(),
      sk: genExpenseID(),
      name: "Legacy rounding",
      currency,
      amount: total,
      participants: Object.fromEntries(
        users.map((id, index) => [id, shares[index]]),
      ),
      createdAt: new Date().toISOString(),
      createdBy: users[0],
      payer: users[0],
    };
    const original = structuredClone(item);
    const [expense] = expensesFromItems([item]);
    assert.equal(
      [...expense.participants.values()].reduce(
        (sum, amount) => sum + amount.minorUnits,
        0n,
      ),
      expense.amount.minorUnits,
    );
    assert.deepEqual(item, original);
    const [reordered] = expensesFromItems([
      {
        ...item,
        participants: Object.fromEntries(
          Object.entries(item.participants).reverse(),
        ),
      },
    ]);
    assert.deepEqual(reordered.participants, expense.participants);
    const converted = Money.convertAndAllocate(
      expense.amount,
      [...expense.participants.values()],
      Rate.create("1"),
      currency,
    );
    assert.deepEqual(converted.total, expense.amount);
    assert.deepEqual(converted.parts, [...expense.participants.values()]);
  }
});

await test("legacy reconciliation rejects inconsistent quantized totals", () => {
  const user = genUserID();
  for (const [amount, shares] of [
    ["0.03", ["0.01", "0.01"]],
    ["0.04", ["0.015", "0.005"]],
  ] as const) {
    assert.throws(
      () =>
        expensesFromItems([
          {
            pk: genSplitID(),
            sk: genExpenseID(),
            name: "Inconsistent total",
            currency: "EUR",
            amount,
            participants: Object.fromEntries(
              [user, genUserID()].map((id, index) => [id, shares[index]]),
            ),
            createdAt: new Date().toISOString(),
            createdBy: user,
            payer: user,
          },
        ]),
      DataIntegrityError,
    );
  }
});

await test("computed totals outside storage precision cannot be persisted", async () => {
  const send = mock.method(
    dynamoClient().config.requestHandler,
    "handle",
    () => {
      assert.fail("Invalid amounts must be rejected before a DynamoDB request");
    },
  );
  const user = genUserID();
  const amount = Money.add(
    Money.create("1e36", "EUR"),
    Money.create("0.01", "EUR"),
  );
  await assert.rejects(
    () =>
      createSplitExpense({
        id: genExpenseID(),
        splitID: genSplitID(),
        name: "Wide computed total",
        currency: "EUR",
        amount,
        payer: user,
        createdBy: user,
        participants: new Map([[user, amount]]),
      }),
    DataIntegrityError,
  );
  assert.equal(send.mock.callCount(), 0);
});

await test("wrapped numeric attributes still decode session and invitation expiry as safe integers", async () => {
  const { NumberValue } = await import("@aws-sdk/lib-dynamodb");
  const { sessionItemSchema, inviteSplitItemSchema, parseItem } =
    await import("./items.js");
  const { genSessionID, genInviteID } = await import("@tasan/common/id");
  const session = genSessionID();
  const user = genUserID();
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(
    parseItem(
      sessionItemSchema,
      {
        pk: session,
        sk: session,
        createdAt: new Date().toISOString(),
        expiresAt: NumberValue.from(String(expiry)),
        absoluteExpiresAt: NumberValue.from(String(expiry + 3600)),
      },
      "session",
    ).expiresAt,
    expiry,
  );
  assert.equal(
    parseItem(
      inviteSplitItemSchema,
      {
        pk: genInviteID(),
        sk: genSplitID(),
        createdAt: new Date().toISOString(),
        createdBy: user,
        expiresAt: NumberValue.from(String(expiry)),
      },
      "invite-split",
    ).expiresAt,
    expiry,
  );
  for (const text of ["9007199254740993", "NaN", "1.5"])
    assert.throws(
      () =>
        parseItem(
          sessionItemSchema,
          {
            pk: session,
            sk: session,
            createdAt: new Date().toISOString(),
            expiresAt: NumberValue.from(text),
          },
          "session",
        ),
      DataIntegrityError,
    );
});

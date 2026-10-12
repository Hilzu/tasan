import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import * as D from "@tasan/common/decimal";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const {
  createSplitExpense,
  findExpenseCreation,
  deleteSplitExpense,
  ExpenseIDConflictError,
} = await import("./split-expense.js");
const actorID = genUserID();
const expense = {
  id: genExpenseID(),
  splitID: genSplitID(),
  createdBy: actorID,
  name: "Dinner",
  currency: "JPY" as const,
  amount: D.create(1000, 0),
  payer: actorID,
  participants: new Map([[actorID, D.create(1000, 0)]]),
};
const conditionFailure = () =>
  new ConditionalCheckFailedException({ $metadata: {}, message: "Exists" });
afterEach(() => {
  mock.restoreAll();
});

// This fake models the atomic condition, so overlapping requests exercise the loser path.
const storage = () => {
  let item: Record<string, unknown> | undefined;
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      assert.equal(command.input.ConsistentRead, true);
      return Promise.resolve({ Item: item && { ...item } });
    }
    assert.ok(command instanceof PutCommand);
    if (command.input.ConditionExpression) {
      assert.equal(
        command.input.ConditionExpression,
        "attribute_not_exists(pk)",
      );
      if (item) return Promise.reject(conditionFailure());
    }
    writes++;
    item = { ...command.input.Item };
    return Promise.resolve({});
  });
  return {
    get item() {
      return item;
    },
    get writes() {
      return writes;
    },
  };
};

await test("sequential and concurrent retries create exactly one expense", async () => {
  const db = storage();
  const results = await Promise.all([
    createSplitExpense(expense),
    createSplitExpense(expense),
  ]);
  assert.deepEqual(results, [{ id: expense.id }, { id: expense.id }]);
  assert.deepEqual(await createSplitExpense(expense), { id: expense.id });
  assert.equal(db.writes, 1);
  assert.equal(db.item?.sk, expense.id);
});

await test("a lost response after commit can safely be retried", async () => {
  let item: Record<string, unknown> | undefined;
  let writes = 0;
  const lostResponse = new Error("Connection lost after commit");
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) return Promise.resolve({ Item: item });
    assert.ok(command instanceof PutCommand);
    if (item) return Promise.reject(conditionFailure());
    item = command.input.Item;
    writes++;
    return Promise.reject(lostResponse);
  });
  await assert.rejects(
    () => createSplitExpense(expense),
    (error: unknown) => error === lostResponse,
  );
  assert.deepEqual(await createSplitExpense(expense), { id: expense.id });
  assert.equal(writes, 1);
});

await test("the first creation wins when the same actor reuses an ID with changed input", async () => {
  const db = storage();
  await createSplitExpense(expense);
  assert.deepEqual(
    await createSplitExpense({
      ...expense,
      name: "Lunch",
      amount: D.create(2000, 0),
    }),
    { id: expense.id },
  );
  assert.equal(db.writes, 1);
  assert.equal(db.item?.name, "Dinner");
  assert.equal(db.item.amount, 1000);
});

await test("different actors cannot reuse an existing expense ID", async () => {
  const db = storage();
  await createSplitExpense(expense);
  await assert.rejects(
    () => createSplitExpense({ ...expense, createdBy: genUserID() }),
    ExpenseIDConflictError,
  );
  assert.equal(db.writes, 1);
});

await test("creation retries preserve original rates and soft deletion", async () => {
  const db = storage();
  await createSplitExpense({ ...expense, conversionRate: 0.006 });
  await deleteSplitExpense(expense.splitID, expense.id, actorID);
  const deletedAt = db.item?.deletedAt;
  assert.ok(deletedAt);
  assert.deepEqual(
    await createSplitExpense({ ...expense, conversionRate: 0.007 }),
    { id: expense.id },
  );
  assert.equal(db.item.conversionRate, 0.006);
  assert.equal(db.item.deletedAt, deletedAt);
  assert.equal(db.writes, 2);
});

await test("existing expenses are recognized without creation metadata", async () => {
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.resolve({ Item: { createdBy: actorID } }),
  );
  assert.deepEqual(
    await findExpenseCreation(expense.splitID, expense.id, actorID),
    { id: expense.id },
  );
});

await test("unrelated storage failures propagate unchanged", async () => {
  const error = new Error("Storage unavailable");
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(
    () => createSplitExpense(expense),
    (failure: unknown) => failure === error,
  );
});

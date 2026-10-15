import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import * as D from "@tasan/common/decimal";
import {
  genExpenseID,
  genOperationID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const {
  createSplitExpense,
  findExpenseCreation,
  deleteSplitExpense,
  ExpenseIDConflictError,
  editSplitExpense,
  ExpenseConflictError,
  findExpenseOperation,
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
  new TransactionCanceledException({
    $metadata: {},
    message: "Exists",
    CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
  });
afterEach(() => {
  mock.restoreAll();
});

// This fake models the atomic condition, so overlapping requests exercise the loser path.
const storage = (missEventualReads = false) => {
  const reads: boolean[] = [];
  const items = new Map<string, Record<string, unknown>>();
  const key = (item: Record<string, unknown>) =>
    `${String(item.pk)}|${String(item.sk)}`;
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      const consistent = command.input.ConsistentRead === true;
      reads.push(consistent);
      const item = items.get(key(command.input.Key ?? {}));
      return Promise.resolve({
        Item:
          missEventualReads && !consistent ? undefined : (
            item && structuredClone(item)
          ),
      });
    }
    assert.ok(command instanceof TransactWriteCommand);
    const puts = (command.input.TransactItems ?? []).map((entry) => {
      assert.ok(entry.Put);
      return entry.Put;
    });
    for (const put of puts) {
      const current = items.get(key(put.Item ?? {}));
      const condition = put.ConditionExpression ?? "";
      if (condition === "attribute_not_exists(pk)") {
        if (current !== undefined) return Promise.reject(conditionFailure());
      } else {
        if (!current || typeof current.deletedAt === "string")
          return Promise.reject(conditionFailure());
        const expected: unknown = put.ExpressionAttributeValues?.[":version"];
        if (
          condition.includes("attribute_not_exists(#version)") ?
            current.version !== undefined
          : current.version !== expected
        )
          return Promise.reject(conditionFailure());
      }
    }
    for (const put of puts) {
      const item = structuredClone(put.Item ?? {});
      items.set(key(item), item);
      if (item.pk === expense.splitID && item.sk === expense.id) writes++;
    }
    return Promise.resolve({});
  });
  return {
    reads,
    items,
    get item() {
      return items.get(`${expense.splitID}|${expense.id}`);
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
  assert.deepEqual(db.reads, [true, true]);
});

await test("a lost response after commit can safely be retried", async () => {
  let item: Record<string, unknown> | undefined;
  let writes = 0;
  const lostResponse = new Error("Connection lost after commit");
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) return Promise.resolve({ Item: item });
    assert.ok(command instanceof TransactWriteCommand);
    if (item) return Promise.reject(conditionFailure());
    item = command.input.TransactItems?.[0].Put?.Item;
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
  await deleteSplitExpense(expense.splitID, expense.id, actorID, {
    operationID: genOperationID(),
    expectedVersion: 1,
  });
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

await test("creation lookups default to eventual consistency and allow opting into strong reads", async () => {
  const db = storage();
  await createSplitExpense(expense);
  assert.deepEqual(
    await findExpenseCreation(expense.splitID, expense.id, actorID),
    { id: expense.id },
  );
  assert.deepEqual(
    await findExpenseCreation(expense.splitID, expense.id, actorID, {
      consistentRead: true,
    }),
    { id: expense.id },
  );
  assert.deepEqual(db.reads, [false, true]);
});

await test("an eventual lookup miss is resolved by a strong read after the failed insert", async () => {
  const db = storage(true);
  await createSplitExpense(expense);
  assert.equal(
    await findExpenseCreation(expense.splitID, expense.id, actorID),
    undefined,
  );
  assert.deepEqual(await createSplitExpense(expense), { id: expense.id });
  assert.deepEqual(db.reads, [false, true]);
  assert.equal(db.writes, 1);
});

const operation = (expectedVersion = 1) => ({
  operationID: genOperationID(),
  expectedVersion,
});

await test("edits atomically preserve snapshots and original creation metadata", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const original = structuredClone(db.item);
  const edit = operation();
  const result = await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    edit,
    { ...expense, name: "Lunch" },
  );
  assert.deepEqual(result, { id: expense.id, version: 2 });
  assert.equal(db.item?.createdAt, original?.createdAt);
  assert.equal(db.item?.createdBy, actorID);
  assert.equal(db.item.updatedBy, actorID);
  assert.equal(db.item.name, "Lunch");
  const snapshots = [...db.items.values()].filter((item) => item.state);
  assert.equal(snapshots.length, 2);
  assert.equal((snapshots[0].state as Record<string, unknown>).name, "Dinner");
  assert.equal((snapshots[1].state as Record<string, unknown>).name, "Lunch");
});

await test("concurrent edits from the same version accept only one revision", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const results = await Promise.allSettled(
    ["Lunch", "Breakfast"].map((name) =>
      editSplitExpense(expense.splitID, expense.id, actorID, operation(), {
        ...expense,
        name,
      }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(failure?.reason instanceof ExpenseConflictError);
  assert.equal(db.writes, 2);
  assert.equal(db.items.size, 3);
});

await test("edit retries return their original result even after later edits and deletion", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const edit = operation();
  const first = await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    edit,
    expense,
  );
  await editSplitExpense(expense.splitID, expense.id, actorID, operation(2), {
    ...expense,
    name: "Later",
  });
  const deletion = operation(3);
  await deleteSplitExpense(expense.splitID, expense.id, actorID, deletion);
  assert.deepEqual(
    await editSplitExpense(expense.splitID, expense.id, actorID, edit, {
      ...expense,
      name: "Retry changed",
    }),
    first,
  );
  assert.deepEqual(
    await deleteSplitExpense(expense.splitID, expense.id, actorID, deletion),
    { id: expense.id, version: 4 },
  );
  assert.equal(db.writes, 4);
  assert.equal(db.item?.name, "Later");
  await assert.rejects(
    () =>
      editSplitExpense(
        expense.splitID,
        expense.id,
        actorID,
        operation(4),
        expense,
      ),
    ExpenseConflictError,
  );
});

await test("operation IDs cannot be reused by another actor or action", async () => {
  storage();
  await createSplitExpense(expense);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, expense);
  await assert.rejects(
    () =>
      findExpenseOperation(
        expense.splitID,
        expense.id,
        edit.operationID,
        genUserID(),
        "edited",
      ),
    ExpenseConflictError,
  );
  await assert.rejects(
    () => deleteSplitExpense(expense.splitID, expense.id, actorID, edit),
    ExpenseConflictError,
  );
});

await test("the first legacy edit atomically adds the original revision", async () => {
  const db = storage();
  await createSplitExpense(expense);
  delete db.item?.version;
  for (const [key, item] of db.items) if (item.state) db.items.delete(key);
  await editSplitExpense(expense.splitID, expense.id, actorID, operation(), {
    ...expense,
    name: "Edited legacy",
  });
  const snapshots = [...db.items.values()].filter((item) => item.state);
  assert.equal(snapshots.length, 2);
  assert.ok(
    snapshots.some(
      (item) =>
        (item.state as Record<string, unknown>).name === "Dinner" &&
        item.action === "created",
    ),
  );
  assert.equal(db.item?.version, 2);
});

await test("returning to the split currency removes the old conversion rate", async () => {
  const db = storage();
  await createSplitExpense({ ...expense, conversionRate: 0.006 });
  await editSplitExpense(expense.splitID, expense.id, actorID, operation(), {
    ...expense,
    currency: "EUR",
    conversionRate: undefined,
  });
  assert.equal(db.item?.conversionRate, undefined);
});

await test("an edit and deletion from the same version cannot both commit", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const results = await Promise.allSettled([
    editSplitExpense(
      expense.splitID,
      expense.id,
      actorID,
      operation(),
      expense,
    ),
    deleteSplitExpense(expense.splitID, expense.id, actorID, operation()),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(db.writes, 2);
});

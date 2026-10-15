import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
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
  findExpenseRevisions,
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
  let conflicts = 0;
  const transactions: TransactWriteCommand[] = [];
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
    if (command instanceof QueryCommand) {
      const values = command.input.ExpressionAttributeValues;
      return Promise.resolve({
        Items: [...items.values()].filter(
          (item) =>
            item.pk === values?.[":pk"] &&
            String(item.sk).startsWith(String(values?.[":prefix"])),
        ),
      });
    }
    assert.ok(command instanceof TransactWriteCommand);
    transactions.push(command);
    if (conflicts > 0) {
      conflicts--;
      return Promise.reject(transactionConflict());
    }
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
    transactions,
    contendNext(count: number) {
      conflicts = count;
    },
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
    () => Promise.resolve({ ...expense, name: "Lunch" }),
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
      editSplitExpense(expense.splitID, expense.id, actorID, operation(), () =>
        Promise.resolve({
          ...expense,
          name,
        }),
      ),
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
    () => Promise.resolve(expense),
  );
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(2),
    () =>
      Promise.resolve({
        ...expense,
        name: "Later",
      }),
  );
  const deletion = operation(3);
  await deleteSplitExpense(expense.splitID, expense.id, actorID, deletion);
  assert.deepEqual(
    await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
      Promise.resolve({
        ...expense,
        name: "Retry changed",
      }),
    ),
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
      editSplitExpense(expense.splitID, expense.id, actorID, operation(4), () =>
        Promise.resolve(expense),
      ),
    ExpenseConflictError,
  );
});

await test("operation IDs cannot be reused by another actor or action", async () => {
  storage();
  await createSplitExpense(expense);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
    Promise.resolve(expense),
  );
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
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(),
    () =>
      Promise.resolve({
        ...expense,
        name: "Edited legacy",
      }),
  );
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
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(),
    () =>
      Promise.resolve({
        ...expense,
        currency: "EUR",
        conversionRate: undefined,
      }),
  );
  assert.equal(db.item?.conversionRate, undefined);
});

await test("an edit and deletion from the same version cannot both commit", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const results = await Promise.allSettled([
    editSplitExpense(expense.splitID, expense.id, actorID, operation(), () =>
      Promise.resolve(expense),
    ),
    deleteSplitExpense(expense.splitID, expense.id, actorID, operation()),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(db.writes, 2);
});

const transactionConflict = () =>
  new TransactionCanceledException({
    $metadata: {},
    message: "Contention",
    CancellationReasons: [{ Code: "TransactionConflict" }, { Code: "None" }],
  });

await test("creation contention retries the same transaction and commits once", async () => {
  const db = storage();
  db.contendNext(2);
  await createSplitExpense(expense);
  assert.equal(db.writes, 1);
  assert.equal(db.transactions.length, 3);
  assert.ok(db.transactions.every((command) => command === db.transactions[0]));
});

await test("edit contention retries without preparing changes again or changing the base version", async () => {
  const db = storage();
  await createSplitExpense(expense);
  db.contendNext(2);
  const prepare = mock.fn(() =>
    Promise.resolve({ ...expense, name: "Correction" }),
  );
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(),
    prepare,
  );
  assert.equal(prepare.mock.callCount(), 1);
  assert.equal(db.item?.version, 2);
  assert.equal(db.writes, 2);
  assert.equal(db.reads.length, 2);
  assert.ok(
    db.transactions.slice(1).every((command) => command === db.transactions[1]),
  );
});

await test("persistent contention produces recoverable conflicts with no extra writes", async () => {
  const db = storage();
  db.contendNext(3);
  await assert.rejects(() => createSplitExpense(expense), ExpenseConflictError);
  assert.equal(db.writes, 0);
  await createSplitExpense(expense);
  db.contendNext(3);
  await assert.rejects(
    () =>
      editSplitExpense(expense.splitID, expense.id, actorID, operation(), () =>
        Promise.resolve(expense),
      ),
    ExpenseConflictError,
  );
  db.contendNext(3);
  await assert.rejects(
    () => deleteSplitExpense(expense.splitID, expense.id, actorID, operation()),
    ExpenseConflictError,
  );
  assert.equal(db.writes, 1);
  assert.equal(db.item?.version, 1);
});

await test("successful deletion contention retries commit one deletion revision", async () => {
  const db = storage();
  await createSplitExpense(expense);
  db.contendNext(2);
  await deleteSplitExpense(expense.splitID, expense.id, actorID, operation());
  assert.equal(db.writes, 2);
  assert.ok(db.item?.deletedAt);
});

await test("conditional failures do not retry or prepare stale changes", async () => {
  const db = storage();
  await createSplitExpense(expense);
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(),
    () => Promise.resolve(expense),
  );
  const prepare = mock.fn(() => Promise.resolve(expense));
  await assert.rejects(
    () =>
      editSplitExpense(
        expense.splitID,
        expense.id,
        actorID,
        operation(),
        prepare,
      ),
    ExpenseConflictError,
  );
  assert.equal(prepare.mock.callCount(), 0);
  assert.equal(db.transactions.length, 2);
});

await test("split history partitions support isolated expense histories and direct operation lookups", async () => {
  const db = storage();
  const other = { ...expense, id: genExpenseID() };
  await createSplitExpense(expense);
  await createSplitExpense(other);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
    Promise.resolve(expense),
  );
  // Idempotency is scoped to an expense, so even the same operation ID cannot collide across expenses.
  await editSplitExpense(other.splitID, other.id, actorID, edit, () =>
    Promise.resolve(other),
  );
  for (const current of [expense, other]) {
    const history = await findExpenseRevisions(current.splitID, current.id);
    assert.deepEqual(
      history.map((revision) => revision.expense.version),
      [1, 2],
    );
    assert.ok(history.every((revision) => revision.expense.id === current.id));
    assert.equal(history[1].operationID, edit.operationID);
    assert.deepEqual(
      await findExpenseOperation(
        current.splitID,
        current.id,
        edit.operationID,
        actorID,
        "edited",
      ),
      { id: current.id, version: 2 },
    );
  }
  const historyItems = [...db.items.values()].filter((item) => item.state);
  assert.equal(new Set(historyItems.map((item) => item.pk)).size, 1);
  assert.equal(historyItems[0].pk, `history#${expense.splitID}`);
});

import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import * as D from "@tasan/common/decimal";
import {
  asOperationID,
  genExpenseID,
  genOperationID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const {
  createSplitExpense,
  deleteSplitExpense,
  editSplitExpense,
  ExpenseConflictError,
  ExpenseIDConflictError,
  ExpenseNotFoundError,
  expensesFromItems,
  findExpenseCreation,
  findExpenseOperation,
  findExpenseRevisions,
  getSplitExpense,
} = await import("./split-expense.js");
const { getSplitWithData } = await import("./split.js");
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
const operation = () => ({ operationID: genOperationID() });
const low = { operationID: asOperationID("op_00000000000000000000000001") };
const high = { operationID: asOperationID("op_00000000000000000000000002") };
afterEach(() => {
  mock.restoreAll();
});

// Conditional puts are local to this store. Separate stores below represent
// Regions accepting distinct operations before replication.
const storage = (missEventualReads = false) => {
  const items = new Map<string, Record<string, unknown>>();
  const reads: boolean[] = [];
  const key = (item: Record<string, unknown>) =>
    `${String(item.pk)}|${String(item.sk)}`;
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      const consistent = command.input.ConsistentRead === true;
      reads.push(consistent);
      return Promise.resolve({
        Item:
          missEventualReads && !consistent ? undefined : (
            structuredClone(items.get(key(command.input.Key ?? {})))
          ),
      });
    }
    if (command instanceof QueryCommand) {
      assert.equal(
        command.input.FilterExpression,
        undefined,
        "Do not filter tombstones before reducing snapshots",
      );
      const values = command.input.ExpressionAttributeValues;
      const all = [...items.values()]
        .filter(
          (item) =>
            item.pk === values?.[":pk"] &&
            (!values?.[":prefix"] ||
              String(item.sk).startsWith(String(values[":prefix"]))),
        )
        .sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
      // Exercise pagination, including tombstones on a different page.
      const start =
        command.input.ExclusiveStartKey ?
          all.findIndex(
            (item) => key(item) === key(command.input.ExclusiveStartKey ?? {}),
          ) + 1
        : 0;
      const page = all.slice(start, start + 1);
      return Promise.resolve({
        Items: structuredClone(page),
        LastEvaluatedKey:
          start + 1 < all.length ?
            { pk: page[0].pk, sk: page[0].sk }
          : undefined,
      });
    }
    assert.ok(command instanceof PutCommand);
    assert.equal(command.input.ConditionExpression, "attribute_not_exists(pk)");
    const item = structuredClone(command.input.Item ?? {});
    if (items.has(key(item)))
      throw new ConditionalCheckFailedException({
        $metadata: {},
        message: "Exists",
      });
    items.set(key(item), item);
    writes++;
    return Promise.resolve({});
  });
  return {
    items,
    reads,
    get writes() {
      return writes;
    },
    get baseline() {
      const item = items.get(`${expense.splitID}|${expense.id}`);
      assert.ok(item);
      return item;
    },
  };
};

await test("concurrent and sequential creation retries insert only one baseline", async () => {
  const db = storage();
  assert.deepEqual(
    await Promise.all([
      createSplitExpense(expense),
      createSplitExpense(expense),
    ]),
    [{ id: expense.id }, { id: expense.id }],
  );
  await createSplitExpense({ ...expense, name: "Changed retry" });
  assert.equal(db.writes, 1);
  assert.equal(db.baseline.name, "Dinner");
  assert.equal(db.baseline.conversionRate, undefined);
  await assert.rejects(
    () => createSplitExpense({ ...expense, createdBy: genUserID() }),
    ExpenseIDConflictError,
  );
});

await test("eventual creation lookup misses are resolved by a strong read after the conditional put", async () => {
  const db = storage(true);
  await createSplitExpense(expense);
  assert.equal(
    await findExpenseCreation(expense.splitID, expense.id, actorID),
    undefined,
  );
  assert.deepEqual(await createSplitExpense(expense), { id: expense.id });
  assert.deepEqual(db.reads, [false, true]);
});

await test("edits retain the original snapshot and creation metadata", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const baseline = structuredClone(db.baseline);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
    Promise.resolve({ ...expense, name: "Lunch" }),
  );
  assert.deepEqual(db.baseline, baseline);
  const current = await getSplitExpense(expense.splitID, expense.id);
  assert.ok(current);
  assert.equal(current.name, "Lunch");
  assert.equal(current.id, expense.id);
  assert.equal(current.createdAt.toISOString(), baseline.createdAt);
  assert.equal(current.updatedBy, actorID);
  const history = await findExpenseRevisions(expense.splitID, expense.id);
  assert.deepEqual(
    history.map((revision) => revision.expense.name),
    ["Dinner", "Lunch"],
  );
  assert.deepEqual(
    history.map((revision) => revision.action),
    ["created", "edited"],
  );
  assert.equal(history[1].operationID, edit.operationID);
  assert.equal(db.writes, 2);
});

await test("concurrent whole snapshots are both accepted and the greatest operation ID wins", async () => {
  const db = storage();
  await createSplitExpense(expense);
  await Promise.all([
    editSplitExpense(expense.splitID, expense.id, actorID, high, () =>
      Promise.resolve({
        ...expense,
        name: "Higher ID",
      }),
    ),
    editSplitExpense(expense.splitID, expense.id, actorID, low, () =>
      Promise.resolve({
        ...expense,
        name: "Lower ID",
      }),
    ),
  ]);
  assert.equal(
    (await getSplitExpense(expense.splitID, expense.id))?.name,
    "Higher ID",
  );
  assert.equal(db.items.size, 3);
  const history = await findExpenseRevisions(expense.splitID, expense.id);
  assert.deepEqual(
    history.map((revision) => revision.operationID),
    [undefined, low.operationID, high.operationID],
  );
});

await test("a later-arriving older operation does not replace the latest snapshot", async () => {
  storage();
  await createSplitExpense(expense);
  await editSplitExpense(expense.splitID, expense.id, actorID, high, () =>
    Promise.resolve({ ...expense, name: "Latest" }),
  );
  await editSplitExpense(expense.splitID, expense.id, actorID, low, () =>
    Promise.resolve({ ...expense, name: "Offline" }),
  );
  assert.equal(
    (await getSplitExpense(expense.splitID, expense.id))?.name,
    "Latest",
  );
});

await test("edit retries preserve their snapshot even after later edits and deletion", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
    Promise.resolve(expense),
  );
  await editSplitExpense(
    expense.splitID,
    expense.id,
    actorID,
    operation(),
    () => Promise.resolve({ ...expense, name: "Later" }),
  );
  const deletion = operation();
  await deleteSplitExpense(expense.splitID, expense.id, actorID, deletion);
  const before = structuredClone([...db.items.values()]);
  assert.deepEqual(
    await editSplitExpense(expense.splitID, expense.id, actorID, edit, () => {
      assert.fail("A retry must not prepare a new payload");
    }),
    { id: expense.id },
  );
  await deleteSplitExpense(expense.splitID, expense.id, actorID, deletion);
  await createSplitExpense(expense);
  assert.deepEqual([...db.items.values()], before);
  assert.equal(await getSplitExpense(expense.splitID, expense.id), undefined);
  await assert.rejects(
    () =>
      editSplitExpense(expense.splitID, expense.id, actorID, operation(), () =>
        Promise.resolve(expense),
      ),
    ExpenseNotFoundError,
  );
});

await test("concurrent edit and deletion both persist while deletion is terminal", async () => {
  const db = storage();
  await createSplitExpense(expense);
  await Promise.all([
    editSplitExpense(expense.splitID, expense.id, actorID, high, () =>
      Promise.resolve(expense),
    ),
    deleteSplitExpense(expense.splitID, expense.id, actorID, low),
  ]);
  assert.equal(db.items.size, 3);
  assert.equal(await getSplitExpense(expense.splitID, expense.id), undefined);
  assert.deepEqual(expensesFromItems([...db.items.values()].reverse()), []);
  assert.ok([...db.items.values()].some((item) => item.deletedAt));
});

await test("independently accepted regional snapshots converge in any replication order", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const baseline = structuredClone(db.baseline);
  await editSplitExpense(expense.splitID, expense.id, actorID, high, () =>
    Promise.resolve({ ...expense, name: "Region A" }),
  );
  const edit = [...db.items.values()].find((item) => item.sk !== expense.id);
  assert.ok(edit);
  // Region B has not seen A's edit.
  db.items.clear();
  db.items.set("baseline", baseline);
  await deleteSplitExpense(expense.splitID, expense.id, actorID, low);
  const tombstone = [...db.items.values()].find((item) => item.deletedAt);
  assert.ok(tombstone);
  for (const items of [
    [baseline, edit, tombstone],
    [tombstone, baseline, edit],
    [edit, tombstone, baseline],
  ]) {
    assert.deepEqual(expensesFromItems(items), []);
    assert.deepEqual(
      expensesFromItems(items.filter((item) => !item.deletedAt)).map(
        (item) => item.name,
      ),
      ["Region A"],
    );
  }
});

await test("split reads reduce snapshots across pages and exclude terminal deletions", async () => {
  const db = storage();
  await createSplitExpense(expense);
  db.items.set("metadata", {
    pk: expense.splitID,
    sk: expense.splitID,
    name: "Trip",
    currency: "JPY",
    createdAt: db.baseline.createdAt,
    createdBy: actorID,
  });
  db.items.set("member", { pk: expense.splitID, sk: actorID });
  const second = { ...expense, id: genExpenseID(), name: "Train" };
  await createSplitExpense(second);
  await editSplitExpense(expense.splitID, expense.id, actorID, high, () =>
    Promise.resolve({ ...expense, name: "Latest" }),
  );
  let split = await getSplitWithData(expense.splitID);
  assert.ok(split);
  assert.equal(split.expenses.length, 2);
  assert.equal(
    split.expenses.find((item) => item.id === expense.id)?.name,
    "Latest",
  );
  assert.ok(split.userIDs.has(actorID));
  await deleteSplitExpense(expense.splitID, expense.id, actorID, low);
  split = await getSplitWithData(expense.splitID);
  assert.ok(split);
  assert.deepEqual(
    split.expenses.map((item) => item.id),
    [second.id],
  );
});

await test("existing soft-deleted baselines remain terminal against replicated edits", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const edit = operation();
  await editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
    Promise.resolve(expense),
  );
  db.baseline.deletedAt = new Date().toISOString();
  assert.equal(await getSplitExpense(expense.splitID, expense.id), undefined);
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

await test("returning to the split currency removes the previous rate only from the new snapshot", async () => {
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
  assert.equal(
    (await getSplitExpense(expense.splitID, expense.id))?.conversionRate,
    undefined,
  );
  assert.equal(db.baseline.conversionRate, 0.006);
});

await test("concurrent retries prepare independently but insert only one snapshot", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const edit = operation();
  const change = () =>
    editSplitExpense(expense.splitID, expense.id, actorID, edit, () =>
      Promise.resolve(expense),
    );
  assert.deepEqual(await Promise.all([change(), change()]), [
    { id: expense.id },
    { id: expense.id },
  ]);
  assert.equal(db.writes, 2);
});

await test("history queries isolate expenses and splits", async () => {
  storage();
  await createSplitExpense(expense);
  await createSplitExpense({
    ...expense,
    id: genExpenseID(),
    name: "Other expense",
  });
  await createSplitExpense({
    ...expense,
    splitID: genSplitID(),
    name: "Other split",
  });
  assert.deepEqual(
    (await findExpenseRevisions(expense.splitID, expense.id)).map(
      (revision) => revision.expense.name,
    ),
    ["Dinner"],
  );
});

await test("a lost write response can be retried without replacing the committed snapshot", async () => {
  const items = new Map<string, Record<string, unknown>>();
  let loseResponse = true;
  const lost = new Error("Connection lost after commit");
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({
        Item: items.get(String(command.input.Key?.sk)),
      });
    assert.ok(command instanceof PutCommand);
    const item = command.input.Item;
    assert.ok(item);
    const key = String(item.sk);
    if (items.has(key))
      throw new ConditionalCheckFailedException({
        $metadata: {},
        message: "Exists",
      });
    items.set(key, structuredClone(item));
    if (loseResponse) {
      loseResponse = false;
      throw lost;
    }
    return Promise.resolve({});
  });
  await assert.rejects(
    () => createSplitExpense(expense),
    (error) => error === lost,
  );
  await createSplitExpense({ ...expense, name: "Changed retry" });
  assert.equal(items.size, 1);
  assert.equal(items.get(expense.id)?.name, "Dinner");
});

await test("concurrent copies of a deletion are idempotent", async () => {
  const db = storage();
  await createSplitExpense(expense);
  const deletion = operation();
  const remove = () =>
    deleteSplitExpense(expense.splitID, expense.id, actorID, deletion);
  assert.deepEqual(await Promise.all([remove(), remove()]), [
    { id: expense.id },
    { id: expense.id },
  ]);
  assert.equal(db.writes, 2);
});

await test("missing expenses and unrelated storage failures propagate", async () => {
  storage();
  await assert.rejects(
    () => deleteSplitExpense(expense.splitID, expense.id, actorID, operation()),
    ExpenseNotFoundError,
  );
  const error = new Error("Storage unavailable");
  mock.method(DynamoDBDocumentClient.prototype, "send", () => {
    throw error;
  });
  await assert.rejects(
    () => createSplitExpense(expense),
    (caught) => caught === error,
  );
});

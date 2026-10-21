import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import type { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import {
  genExpenseID,
  genOperationID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";
import type {
  createSplitExpense,
  deleteSplitExpense,
  EditSplitExpense,
  editSplitExpense,
  findExpenseCreation,
  findExpenseRevisions,
  findSplitUsers,
  getSplitExpense,
  Split,
} from "@tasan/data";

import { ApplicationError } from "~/.server/services/errors";
import type { NewExpense } from "~/.server/services/expenses";
import type {
  requireMembership,
  requireSplit,
} from "~/.server/services/splits";

const actorID = genUserID();
const payerID = genUserID();
const outsiderID = genUserID();
const splitID = genSplitID();
const split: Split = {
  id: splitID,
  name: "Trip",
  currency: "EUR",
  createdBy: actorID,
  createdAt: new Date(),
};
const expense: NewExpense = {
  id: genExpenseID(),
  name: "Dinner",
  currency: "EUR",
  amount: 10,
  payer: payerID,
  participants: new Map([[actorID, 10]]),
};
const savedChanges: EditSplitExpense[] = [];
const persistenceMock = {
  cache: true,
  exports: {
    ExpenseIDConflictError: class ExpenseIDConflictError extends Error {},
    ExpenseConflictError: class ExpenseConflictError extends Error {},
    ExpenseNotFoundError: class ExpenseNotFoundError extends Error {},
    editSplitExpense: mock.fn<typeof editSplitExpense>(
      async (_splitID, _expenseID, _actorID, _operation, prepare) => {
        const current = await persistenceMock.exports.getSplitExpense(
          _splitID,
          _expenseID,
        );
        assert.ok(current);
        savedChanges.push(await prepare(current));
        return { id: _expenseID };
      },
    ),
    getSplitExpense: mock.fn<typeof getSplitExpense>(() =>
      Promise.resolve({
        ...expense,
        splitID,
        createdBy: actorID,
        createdAt: new Date(),
        amount: { value: 10, fractions: 2 },
        participants: new Map([[actorID, { value: 10, fractions: 2 }]]),
      }),
    ),
    findExpenseRevisions: mock.fn<typeof findExpenseRevisions>(() =>
      Promise.resolve([]),
    ),
    findExpenseCreation: mock.fn<typeof findExpenseCreation>(() =>
      Promise.resolve(undefined),
    ),
    createSplitExpense: mock.fn<typeof createSplitExpense>(() =>
      Promise.resolve({ id: genExpenseID() }),
    ),
    deleteSplitExpense: mock.fn<typeof deleteSplitExpense>(() =>
      Promise.resolve({ id: expense.id }),
    ),
    findSplitUsers: mock.fn<typeof findSplitUsers>(() =>
      Promise.resolve(
        [actorID, payerID].map((userID) => ({
          userID,
          splitID,
          createdBy: actorID,
        })),
      ),
    ),
  },
};
const splitMock = {
  cache: true,
  exports: {
    requireMembership: mock.fn<typeof requireMembership>(() =>
      Promise.resolve(),
    ),
    requireSplit: mock.fn<typeof requireSplit>(() => Promise.resolve(split)),
  },
};
const rate = mock.fn<typeof fetchCurrencyConversionRate>(() =>
  Promise.resolve(0.8),
);
const currencyMock = {
  cache: true,
  exports: { fetchCurrencyConversionRate: rate },
};
// Install module mocks before importing the functions under test.
mock.module("@tasan/data", persistenceMock);
mock.module("../../app/.server/services/splits.ts", splitMock);
mock.module("@tasan/common/currency-convert", currencyMock);
const { createExpense, deleteExpense, editExpense, getExpenseHistory } =
  await import("~/.server/services/expenses");
const { createSplitExpense: save, deleteSplitExpense: remove } =
  persistenceMock.exports;

beforeEach(() => {
  savedChanges.length = 0;
  for (const dependency of [
    save,
    remove,
    persistenceMock.exports.findExpenseCreation,
    persistenceMock.exports.editSplitExpense,
    persistenceMock.exports.getSplitExpense,
    persistenceMock.exports.findExpenseRevisions,
    persistenceMock.exports.findSplitUsers,
    ...Object.values(splitMock.exports),
    rate,
  ]) {
    dependency.mock.restore();
    dependency.mock.resetCalls();
  }
});

await test("expense creation uses the stored split currency and stamps the actor", async () => {
  await createExpense(actorID, splitID, { ...expense, currency: "USD" });
  assert.deepEqual(
    splitMock.exports.requireMembership.mock.calls[0].arguments,
    [actorID, splitID],
  );
  assert.deepEqual(splitMock.exports.requireSplit.mock.calls[0].arguments, [
    splitID,
  ]);
  assert.deepEqual(rate.mock.calls[0].arguments, ["USD", "EUR"]);
  assert.equal(save.mock.callCount(), 1);
  const [saved] = save.mock.calls[0].arguments;
  assert.equal(saved.createdBy, actorID);
  assert.equal(saved.splitID, splitID);
  assert.equal(saved.conversionRate, 0.8);
  assert.equal(saved.participants.get(actorID)?.value, 10);
});

await test("same-currency expenses do not call the rate provider", async () => {
  await createExpense(actorID, splitID, expense);
  assert.equal(rate.mock.callCount(), 0);
  assert.equal(save.mock.calls[0].arguments[0].conversionRate, undefined);
});

await test("expense operations stop when membership is rejected", async () => {
  splitMock.exports.requireMembership.mock.mockImplementation(() =>
    Promise.reject(new ApplicationError("not_found", "Split not found.")),
  );
  await assert.rejects(() => createExpense(outsiderID, splitID, expense), {
    code: "not_found",
  });
  await assert.rejects(
    () => deleteExpense(outsiderID, splitID, genExpenseID(), genOperationID()),
    { code: "not_found" },
  );
  assert.equal(splitMock.exports.requireSplit.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(persistenceMock.exports.findExpenseCreation.mock.callCount(), 0);
});

await test("expense validation rejects invalid members, totals, and precision without writing", async (t) => {
  const cases: [string, Partial<NewExpense>, string][] = [
    ["payer outside split", { payer: outsiderID }, "payer"],
    [
      "participant outside split",
      { participants: new Map([[outsiderID, 10]]) },
      "participants",
    ],
    ["empty participants", { participants: new Map() }, "participants"],
    [
      "unbalanced shares",
      { participants: new Map([[actorID, 9]]) },
      "participants",
    ],
    [
      "negative share",
      { participants: new Map([[actorID, -10]]) },
      "participants",
    ],
    [
      "zero participant amount",
      {
        participants: new Map([
          [actorID, 0],
          [payerID, 10],
        ]),
      },
      "participants",
    ],
    ["zero amount", { amount: 0 }, "amount"],
    ["non-finite amount", { amount: Infinity }, "amount"],
    ["excess precision", { amount: 10.001 }, "amount"],
    ["fractional JPY", { currency: "JPY", amount: 10.5 }, "amount"],
    [
      "fractional JPY share",
      { currency: "JPY", participants: new Map([[actorID, 10.5]]) },
      "participants",
    ],
    ["empty name", { name: "" }, "name"],
  ];
  for (const [name, input, field] of cases)
    await t.test(name, async () => {
      await assert.rejects(
        () => createExpense(actorID, splitID, { ...expense, ...input }),
        (error: unknown) => {
          assert.ok(error instanceof ApplicationError);
          assert.equal(error.code, "invalid_input");
          assert.ok(error.fieldErrors[field].length);
          return true;
        },
      );
      assert.equal(save.mock.callCount(), 0);
    });
});

await test("provider failures and invalid rates cannot persist an expense", async () => {
  for (const provider of [
    () => Promise.reject(new Error("Provider unavailable")),
    () => Promise.resolve(NaN),
    () => Promise.resolve(0),
  ]) {
    rate.mock.mockImplementation(provider);
    await assert.rejects(() =>
      createExpense(actorID, splitID, { ...expense, currency: "USD" }),
    );
    assert.equal(save.mock.callCount(), 0);
  }
});

await test("retries return the original ID without fetching rates or validating changed membership", async () => {
  persistenceMock.exports.findExpenseCreation.mock.mockImplementation(() =>
    Promise.resolve({ id: expense.id }),
  );
  assert.deepEqual(
    await createExpense(actorID, splitID, { ...expense, currency: "USD" }),
    { id: expense.id },
  );
  assert.equal(save.mock.callCount(), 0);
  assert.equal(rate.mock.callCount(), 0);
  assert.equal(persistenceMock.exports.findSplitUsers.mock.callCount(), 0);
});

await test("existing IDs return the first result without validating replacement payloads", async () => {
  persistenceMock.exports.findExpenseCreation.mock.mockImplementation(() =>
    Promise.resolve({ id: expense.id }),
  );
  assert.deepEqual(
    await createExpense(actorID, splitID, {
      ...expense,
      name: "",
      amount: 0,
      participants: new Map(),
    }),
    { id: expense.id },
  );
  assert.deepEqual(
    persistenceMock.exports.findExpenseCreation.mock.calls[0].arguments,
    [splitID, expense.id, actorID],
  );
  assert.equal(save.mock.callCount(), 0);
  assert.equal(splitMock.exports.requireSplit.mock.callCount(), 0);
});

await test("both lookup and racing writes translate ID collisions into conflicts", async () => {
  const collision = new persistenceMock.exports.ExpenseIDConflictError();
  persistenceMock.exports.findExpenseCreation.mock.mockImplementation(() =>
    Promise.reject(collision),
  );
  await assert.rejects(() => createExpense(actorID, splitID, expense), {
    code: "conflict",
  });
  persistenceMock.exports.findExpenseCreation.mock.mockImplementation(() =>
    Promise.resolve(undefined),
  );
  save.mock.mockImplementation(() => Promise.reject(collision));
  await assert.rejects(() => createExpense(actorID, splitID, expense), {
    code: "conflict",
  });
});

await test("malformed client expense IDs are rejected without writing", async () => {
  await assert.rejects(
    () =>
      createExpense(actorID, splitID, {
        ...expense,
        id: `${expense.id}_extra` as typeof expense.id,
      }),
    { code: "invalid_input" },
  );
  assert.equal(save.mock.callCount(), 0);
});

await test("client ownership fields cannot replace the authenticated actor", async () => {
  const input = { ...expense, createdBy: outsiderID, actorID: outsiderID };
  await createExpense(actorID, splitID, input);
  assert.equal(save.mock.calls[0].arguments[0].createdBy, actorID);
});

await test("malformed and oversized IDs never reach persistence", async () => {
  for (const id of [
    `${expense.id}\n`,
    ` ${expense.id}`,
    expense.id.toUpperCase(),
    `exp_${"0".repeat(100_000)}`,
  ]) {
    await assert.rejects(
      () =>
        createExpense(actorID, splitID, {
          ...expense,
          id: id as typeof expense.id,
        }),
      { code: "invalid_input" },
    );
  }
  assert.equal(persistenceMock.exports.findExpenseCreation.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});

await test("expense logs include action parameters and persisted ID without free-text names", async () => {
  const entries: {
    action: string;
    outcome: string;
    expenseId: string;
    parameters: unknown;
  }[] = [];
  const write = mock.method(process.stdout, "write", (chunk: unknown) => {
    entries.push(JSON.parse(String(chunk)) as (typeof entries)[number]);
    return true;
  });
  try {
    await createExpense(actorID, splitID, expense);
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((entry) => entry.outcome),
      ["attempted", "success"],
    );
    for (const entry of entries) {
      assert.equal(entry.action, "expense.create");
      assert.equal(entry.expenseId, expense.id);
      assert.deepEqual(entry.parameters, {
        amount: expense.amount,
        currency: expense.currency,
        payer: expense.payer,
        participants: Object.fromEntries(expense.participants),
      });
    }
    assert.ok(!JSON.stringify(entries).includes(expense.name));
  } finally {
    write.mock.restore();
  }
});

await test("split metadata and members are fetched concurrently after authorization and deduplication", async () => {
  let resolveSplit!: (value: Split) => void;
  splitMock.exports.requireSplit.mock.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSplit = resolve;
      }),
  );
  persistenceMock.exports.findSplitUsers.mock.mockImplementation(() => {
    resolveSplit(split);
    return Promise.resolve(
      [actorID, payerID].map((userID) => ({
        userID,
        splitID,
        createdBy: actorID,
      })),
    );
  });
  await createExpense(actorID, splitID, expense);
  assert.equal(save.mock.callCount(), 1);
});

const operation = genOperationID;
const edits = persistenceMock.exports;

await test("edits preserve the recorded rate when currency is unchanged", async () => {
  const original = await edits.getSplitExpense(splitID, expense.id);
  assert.ok(original);
  edits.getSplitExpense.mock.mockImplementation(() =>
    Promise.resolve({ ...original, currency: "USD", conversionRate: 0.75 }),
  );
  await editExpense(actorID, splitID, expense.id, operation(), {
    ...expense,
    currency: "USD",
    name: "Corrected",
  });
  assert.equal(rate.mock.callCount(), 0);
  assert.equal(savedChanges[0].conversionRate, 0.75);
  assert.equal(edits.editSplitExpense.mock.calls[0].arguments[2], actorID);
});

await test("changing currency obtains a rate and returning home removes it", async () => {
  await editExpense(actorID, splitID, expense.id, operation(), {
    ...expense,
    currency: "USD",
  });
  assert.deepEqual(rate.mock.calls[0].arguments, ["USD", "EUR"]);
  const original = await edits.getSplitExpense(splitID, expense.id);
  assert.ok(original);
  edits.getSplitExpense.mock.mockImplementation(() =>
    Promise.resolve({ ...original, currency: "USD", conversionRate: 0.75 }),
  );
  await editExpense(actorID, splitID, expense.id, operation(), expense);
  assert.equal(savedChanges[1].conversionRate, undefined);
});

await test("edit retries bypass replacement payload validation and rate lookup", async () => {
  edits.editSplitExpense.mock.mockImplementation(() =>
    Promise.resolve({ id: expense.id }),
  );
  assert.deepEqual(
    await editExpense(actorID, splitID, expense.id, operation(), {
      ...expense,
      name: "",
      amount: 0,
    }),
    { id: expense.id },
  );
  assert.equal(edits.editSplitExpense.mock.callCount(), 1);
  assert.equal(savedChanges.length, 0);
  assert.equal(rate.mock.callCount(), 0);
  assert.equal(edits.getSplitExpense.mock.callCount(), 0);
});

await test("edits and history are unavailable to nonmembers", async () => {
  splitMock.exports.requireMembership.mock.mockImplementation(() =>
    Promise.reject(new ApplicationError("not_found", "Split not found.")),
  );
  await assert.rejects(
    () => editExpense(outsiderID, splitID, expense.id, operation(), expense),
    { code: "not_found" },
  );
  await assert.rejects(
    () => getExpenseHistory(outsiderID, splitID, expense.id),
    { code: "not_found" },
  );
  assert.equal(edits.editSplitExpense.mock.callCount(), 0);
  assert.equal(edits.getSplitExpense.mock.callCount(), 0);
  assert.equal(edits.findExpenseRevisions.mock.callCount(), 0);
});

await test("storage conflicts return application conflicts", async () => {
  edits.editSplitExpense.mock.mockImplementation(() =>
    Promise.reject(new edits.ExpenseConflictError("Changed")),
  );
  await assert.rejects(
    () => editExpense(actorID, splitID, expense.id, operation(), expense),
    { code: "conflict" },
  );
});

await test("edit validation rejects invalid allocation and invalid operation IDs", async () => {
  await assert.rejects(
    () =>
      editExpense(actorID, splitID, expense.id, operation(), {
        ...expense,
        participants: new Map([[outsiderID, 10]]),
      }),
    { code: "invalid_input" },
  );
  const invalid = "op_bad" as ReturnType<typeof genOperationID>;
  await assert.rejects(
    () => editExpense(actorID, splitID, expense.id, invalid, expense),
    { code: "invalid_input" },
  );
  await assert.rejects(
    () => deleteExpense(actorID, splitID, expense.id, invalid),
    { code: "invalid_input" },
  );
  assert.equal(savedChanges.length, 0);
  assert.equal(remove.mock.callCount(), 0);
});

await test("expense details derive the latest snapshot from one history query", async () => {
  const original = await edits.getSplitExpense(splitID, expense.id);
  assert.ok(original);
  edits.getSplitExpense.mock.resetCalls();
  edits.findExpenseRevisions.mock.mockImplementation(() =>
    Promise.resolve([
      {
        action: "created",
        recordedAt: original.createdAt,
        recordedBy: actorID,
        expense: original,
      },
      {
        operationID: genOperationID(),
        action: "edited",
        recordedAt: new Date(),
        recordedBy: actorID,
        expense: { ...original, name: "Corrected" },
      },
    ]),
  );
  const result = await getExpenseHistory(actorID, splitID, expense.id);
  assert.equal(result.expense.name, "Corrected");
  assert.equal(result.history.length, 2);
  assert.equal(edits.getSplitExpense.mock.callCount(), 0);
  assert.equal(edits.findExpenseRevisions.mock.callCount(), 1);
});

await test("expense details reject missing expenses and any deletion regardless of ordering", async () => {
  await assert.rejects(() => getExpenseHistory(actorID, splitID, expense.id), {
    code: "not_found",
  });
  const original = await edits.getSplitExpense(splitID, expense.id);
  assert.ok(original);
  edits.findExpenseRevisions.mock.mockImplementation(() =>
    Promise.resolve([
      {
        operationID: genOperationID(),
        action: "deleted",
        recordedAt: new Date(),
        recordedBy: actorID,
        expense: original,
      },
      {
        operationID: genOperationID(),
        action: "edited",
        recordedAt: new Date(),
        recordedBy: actorID,
        expense: original,
      },
    ]),
  );
  await assert.rejects(() => getExpenseHistory(actorID, splitID, expense.id), {
    code: "not_found",
  });
});

await test("recording a repayment reverses the debt in the home currency", async () => {
  const { recordRepayment } = await import("~/.server/services/expenses");
  const id = genExpenseID();
  await recordRepayment(actorID, splitID, {
    id,
    payer: actorID,
    recipient: payerID,
    amount: 25,
  });
  const saved = save.mock.calls[0].arguments[0];
  assert.equal(saved.id, id);
  assert.equal(saved.kind, "repayment");
  assert.equal(saved.currency, "EUR");
  assert.equal(saved.payer, actorID);
  assert.deepEqual(
    [...saved.participants],
    [[payerID, { value: 25, fractions: 2 }]],
  );
  assert.equal(saved.createdBy, actorID);
  assert.equal(rate.mock.callCount(), 0);
});

await test("repayments reject invalid participants and amounts", async () => {
  const { recordRepayment } = await import("~/.server/services/expenses");
  const input = {
    id: genExpenseID(),
    payer: actorID,
    recipient: payerID,
    amount: 25,
  };
  for (const changes of [
    { recipient: actorID },
    { payer: outsiderID },
    { recipient: outsiderID },
    { amount: 0 },
    { amount: -1 },
    { amount: 1.001 },
    { amount: Infinity },
  ])
    await assert.rejects(
      () => recordRepayment(actorID, splitID, { ...input, ...changes }),
      { code: "invalid_input" },
    );
  assert.equal(save.mock.callCount(), 0);
});

await test("repayment retry returns the existing record without writing again", async () => {
  const { recordRepayment } = await import("~/.server/services/expenses");
  const id = genExpenseID();
  persistenceMock.exports.findExpenseCreation.mock.mockImplementation(() =>
    Promise.resolve({ id }),
  );
  assert.deepEqual(
    await recordRepayment(actorID, splitID, {
      id,
      payer: actorID,
      recipient: payerID,
      amount: 25,
    }),
    { id },
  );
  assert.equal(save.mock.callCount(), 0);
});

await test("nonmembers cannot record repayments", async () => {
  const { recordRepayment } = await import("~/.server/services/expenses");
  splitMock.exports.requireMembership.mock.mockImplementation(() =>
    Promise.reject(new ApplicationError("not_found", "Split not found.")),
  );
  await assert.rejects(
    () =>
      recordRepayment(outsiderID, splitID, {
        id: genExpenseID(),
        payer: actorID,
        recipient: payerID,
        amount: 25,
      }),
    { code: "not_found" },
  );
  assert.equal(save.mock.callCount(), 0);
});

await test("ordinary expense edits cannot change a recorded payment", async () => {
  const original = await persistenceMock.exports.getSplitExpense(
    splitID,
    expense.id,
  );
  assert.ok(original);
  persistenceMock.exports.getSplitExpense.mock.mockImplementation(() =>
    Promise.resolve({ ...original, kind: "repayment" }),
  );
  await assert.rejects(
    () => editExpense(actorID, splitID, expense.id, genOperationID(), expense),
    { code: "invalid_input" },
  );
  assert.equal(savedChanges.length, 0);
});

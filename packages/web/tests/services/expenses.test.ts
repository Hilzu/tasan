import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import type { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import type {
  createSplitExpense,
  deleteSplitExpense,
  findSplitUsers,
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
  name: "Dinner",
  currency: "EUR",
  amount: 10,
  payer: payerID,
  participants: new Map([[actorID, 10]]),
};
const persistenceMock = {
  cache: true,
  exports: {
    createSplitExpense: mock.fn<typeof createSplitExpense>(() =>
      Promise.resolve({ id: genExpenseID() }),
    ),
    deleteSplitExpense: mock.fn<typeof deleteSplitExpense>(() =>
      Promise.resolve(),
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
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/data", persistenceMock);
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("../../app/.server/services/splits.ts", splitMock);
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/common/currency-convert", currencyMock);
const { createExpense, deleteExpense } =
  await import("~/.server/services/expenses");
const { createSplitExpense: save, deleteSplitExpense: remove } =
  persistenceMock.exports;

beforeEach(() => {
  for (const dependency of [
    ...Object.values(persistenceMock.exports),
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
    () => deleteExpense(outsiderID, splitID, genExpenseID()),
    { code: "not_found" },
  );
  assert.equal(splitMock.exports.requireSplit.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
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

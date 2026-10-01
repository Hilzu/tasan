import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import {
  asCognitoUserID,
  genExpenseID,
  genInviteID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";
import type * as persistence from "@tasan/data";
import type { CreateSplitExpense, Split } from "@tasan/data";

import { ApplicationError } from "~/.server/services/errors";
import type { NewExpense } from "~/.server/services/expenses";
import { errorResponse, formErrorResponse } from "~/.server/services/http";

type TestAdapters = Pick<
  typeof persistence,
  | "createSplit"
  | "findUsersSplits"
  | "getSplit"
  | "getSplitUser"
  | "getSplitWithData"
  | "findSplitUsers"
  | "getUsers"
  | "createSplitExpense"
  | "deleteSplitExpense"
  | "createInviteForSplit"
  | "findInviteForSplit"
  | "consumeInviteForSplit"
  | "ensureCognitoUser"
  | "putUser"
> & { fetchCurrencyConversionRate: typeof fetchCurrencyConversionRate };

let adapters!: TestAdapters;

const actorID = genUserID();
const payerID = genUserID();
const outsiderID = genUserID();
const splitID = genSplitID();
const inviteID = genInviteID();
const now = new Date("2026-10-01T12:00:00Z");
const split: Split = {
  id: splitID,
  name: "Trip",
  currency: "EUR",
  createdBy: actorID,
  createdAt: now,
};
const invite = {
  id: inviteID,
  splitID,
  createdBy: actorID,
  expiresAt: new Date(now.getTime() + 1000),
};
const expense: NewExpense = {
  name: "Dinner",
  currency: "EUR",
  amount: 10,
  payer: payerID,
  participants: new Map([[actorID, 10]]),
};

const fixture = (overrides: Partial<TestAdapters> = {}) => {
  const writes: CreateSplitExpense[] = [];
  adapters = {
    createSplit: () => Promise.resolve({ id: splitID }),
    findUsersSplits: () => Promise.resolve([split]),
    getSplit: () => Promise.resolve(split),
    getSplitUser: () =>
      Promise.resolve({ userID: actorID, splitID, createdBy: actorID }),
    getSplitWithData: () =>
      Promise.resolve({
        ...split,
        userIDs: new Set([actorID, payerID]),
        expenses: [],
      }),
    findSplitUsers: () =>
      Promise.resolve(
        [actorID, payerID].map((userID) => ({
          userID,
          splitID,
          createdBy: actorID,
        })),
      ),
    getUsers: () => Promise.resolve([]),
    createSplitExpense: (value) => {
      writes.push(value);
      return Promise.resolve({ id: genExpenseID() });
    },
    deleteSplitExpense: () => Promise.resolve(),
    createInviteForSplit: () => Promise.resolve({ id: inviteID }),
    findInviteForSplit: () => Promise.resolve(invite),
    consumeInviteForSplit: () => Promise.resolve(true),
    ensureCognitoUser: () => Promise.resolve({ userID: actorID }),
    putUser: () => Promise.resolve(),
    fetchCurrencyConversionRate: () => Promise.resolve(2),
    ...overrides,
  };
  return { writes };
};

fixture();
const dataMock = {
  cache: true,
  exports: Object.fromEntries(
    Object.keys(adapters)
      .filter((name) => name !== "fetchCurrencyConversionRate")
      .map((name) => [
        name,
        (...args: unknown[]) =>
          Reflect.apply(
            adapters[name as keyof TestAdapters],
            undefined,
            args,
          ) as Promise<unknown>,
      ]),
  ),
};
const currencyMock = {
  cache: true,
  exports: {
    fetchCurrencyConversionRate: (
      ...args: Parameters<typeof fetchCurrencyConversionRate>
    ) => adapters.fetchCurrencyConversionRate(...args),
  },
};
// Module mocks are enabled explicitly by the web test command. Mocks stay local
// to this test file's process, and each fixture replaces the adapter behavior.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/data", dataMock);
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/common/currency-convert", currencyMock);
mock.method(Date, "now", () => now.getTime());

const { createExpense, deleteExpense } =
  await import("~/.server/services/expenses");
const { createSplit, getSplit } = await import("~/.server/services/splits");
const { acceptInvite, createInvite, previewInvite } =
  await import("~/.server/services/invites");
const { provisionAuthenticatedUser } = await import("~/.server/services/users");

await test("expense creation uses the stored split currency and stamps the actor", async () => {
  const rates: string[][] = [];
  const { writes } = fixture({
    fetchCurrencyConversionRate: (from, to) => {
      rates.push([from, to]);
      return Promise.resolve(0.8);
    },
  });
  await createExpense(actorID, splitID, { ...expense, currency: "USD" });
  assert.deepEqual(rates, [["USD", "EUR"]]);
  assert.equal(writes[0].createdBy, actorID);
  assert.equal(writes[0].splitID, splitID);
  assert.equal(writes[0].conversionRate, 0.8);
  assert.equal(writes[0].participants.get(actorID)?.value, 10);
});

await test("same-currency expenses do not call the rate provider", async () => {
  const { writes } = fixture({
    fetchCurrencyConversionRate: () => {
      assert.fail("Unexpected currency lookup");
    },
  });
  await createExpense(actorID, splitID, expense);
  assert.equal(writes[0].conversionRate, undefined);
});

await test("split operations reject non-members before reading or writing split data", async () => {
  const { writes } = fixture({
    getSplitUser: () => Promise.resolve(undefined),
    getSplit: () => {
      assert.fail("Unexpected split read");
    },
    getSplitWithData: () => {
      assert.fail("Unexpected aggregate read");
    },
    createInviteForSplit: () => {
      assert.fail("Unexpected invite write");
    },
    deleteSplitExpense: () => {
      assert.fail("Unexpected delete");
    },
  });
  for (const operation of [
    () => createExpense(outsiderID, splitID, expense),
    () => getSplit(outsiderID, splitID),
    () => createInvite(outsiderID, splitID),
    () => deleteExpense(outsiderID, splitID, genExpenseID()),
  ]) {
    await assert.rejects(operation, { code: "not_found" });
  }
  assert.equal(writes.length, 0);
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
      const { writes } = fixture();
      await assert.rejects(
        () => createExpense(actorID, splitID, { ...expense, ...input }),
        (error: unknown) => {
          assert.ok(error instanceof ApplicationError);
          assert.equal(error.code, "invalid_input");
          assert.ok(error.fieldErrors[field].length);
          return true;
        },
      );
      assert.equal(writes.length, 0);
    });
});

await test("provider failures and invalid rates cannot persist an expense", async () => {
  for (const provider of [
    () => Promise.reject(new Error("Provider unavailable")),
    () => Promise.resolve(NaN),
    () => Promise.resolve(0),
  ]) {
    const { writes } = fixture({ fetchCurrencyConversionRate: provider });
    await assert.rejects(() =>
      createExpense(actorID, splitID, { ...expense, currency: "USD" }),
    );
    assert.equal(writes.length, 0);
  }
});

await test("invite preview exposes metadata without loading expenses", async () => {
  fixture({
    getSplitWithData: () => {
      assert.fail("Unexpected aggregate read");
    },
  });
  assert.deepEqual(await previewInvite(inviteID), { split });
});

await test("expired and missing invites are rejected before consumption", async () => {
  for (const value of [undefined, { ...invite, expiresAt: now }]) {
    fixture({
      findInviteForSplit: () => Promise.resolve(value),
      consumeInviteForSplit: () => {
        assert.fail("Unexpected invite consumption");
      },
    });
    await assert.rejects(() => previewInvite(inviteID), {
      code: "not_found",
    });
    await assert.rejects(() => acceptInvite(actorID, inviteID), {
      code: "not_found",
    });
  }
});

await test("invite acceptance delegates consumption and membership to one atomic operation", async () => {
  let consumed = false;
  fixture({
    consumeInviteForSplit: (value, userID) => {
      assert.deepEqual(value, invite);
      assert.equal(userID, outsiderID);
      const accepted = !consumed;
      consumed = true;
      return Promise.resolve(accepted);
    },
  });
  assert.deepEqual(await acceptInvite(outsiderID, inviteID), { splitID });
  await assert.rejects(() => acceptInvite(outsiderID, inviteID), {
    code: "not_found",
  });
});

await test("split creation stamps the actor and rejects invalid names", async () => {
  fixture({
    createSplit: (input) => {
      assert.deepEqual(input, {
        name: "Trip",
        currency: "EUR",
        createdBy: actorID,
      });
      return Promise.resolve({ id: splitID });
    },
  });
  assert.deepEqual(
    await createSplit(actorID, { name: "Trip", currency: "EUR" }),
    { id: splitID },
  );
  await assert.rejects(
    () => createSplit(actorID, { name: "x".repeat(65), currency: "EUR" }),
    { code: "invalid_input" },
  );
});

await test("provisioning saves the profile under the resolved application identity", async () => {
  const cognitoID = asCognitoUserID("12345678-1234-4123-8123-123456789abc");
  let saved = false;
  fixture({
    ensureCognitoUser: (input) => {
      assert.deepEqual(input, { cognitoID });
      return Promise.resolve({ userID: actorID });
    },
    putUser: (input) => {
      assert.deepEqual(input, {
        id: actorID,
        email: "user@example.com",
        name: "User",
      });
      saved = true;
      return Promise.resolve();
    },
  });
  assert.deepEqual(
    await provisionAuthenticatedUser({
      cognitoID,
      email: "user@example.com",
      name: "User",
    }),
    { userID: actorID },
  );
  assert.equal(saved, true);
});

await test("HTTP response helpers map expected errors and preserve unexpected failures", () => {
  assert.equal(
    errorResponse(new ApplicationError("not_found", "Missing")).status,
    404,
  );
  const failure = new Error("Storage unavailable");
  assert.throws(
    () => errorResponse(failure),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => formErrorResponse(failure),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => formErrorResponse(new ApplicationError("not_found", "Missing")),
    (error: unknown) => error instanceof Response && error.status === 404,
  );
  const response = formErrorResponse(
    new ApplicationError("invalid_input", "Invalid payer", {
      payer: ["Invalid payer"],
    }),
  );
  assert.ok(response.init);
  assert.equal(response.init.status, 400);
  assert.deepEqual(response.data.errors.fieldErrors, {
    payer: ["Invalid payer"],
  });
});

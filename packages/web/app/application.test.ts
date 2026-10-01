import assert from "node:assert/strict";
import { test } from "node:test";

import {
  asCognitoUserID,
  genExpenseID,
  genInviteID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";
import type { CreateSplitExpense, Split } from "@tasan/data";

import {
  type ApplicationDependencies,
  createApplication,
  type NewExpense,
} from "~/.server/services/application";
import { ApplicationError } from "~/.server/services/errors";
import { runApplication, runFormApplication } from "~/.server/services/http";

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

const fixture = (overrides: Partial<ApplicationDependencies> = {}) => {
  const writes: CreateSplitExpense[] = [];
  const deps: ApplicationDependencies = {
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
    now: () => now,
    ...overrides,
  };
  return { app: createApplication(deps), writes };
};

await test("expense creation uses the stored split currency and stamps the actor", async () => {
  const rates: string[][] = [];
  const { app, writes } = fixture({
    fetchCurrencyConversionRate: (from, to) => {
      rates.push([from, to]);
      return Promise.resolve(0.8);
    },
  });
  await app.createExpense(actorID, splitID, { ...expense, currency: "USD" });
  assert.deepEqual(rates, [["USD", "EUR"]]);
  assert.equal(writes[0].createdBy, actorID);
  assert.equal(writes[0].splitID, splitID);
  assert.equal(writes[0].conversionRate, 0.8);
  assert.equal(writes[0].participants.get(actorID)?.value, 10);
});

await test("same-currency expenses do not call the rate provider", async () => {
  const { app, writes } = fixture({
    fetchCurrencyConversionRate: () => {
      assert.fail("Unexpected currency lookup");
    },
  });
  await app.createExpense(actorID, splitID, expense);
  assert.equal(writes[0].conversionRate, undefined);
});

await test("split operations reject non-members before reading or writing split data", async () => {
  const { app, writes } = fixture({
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
    () => app.createExpense(outsiderID, splitID, expense),
    () => app.getSplit(outsiderID, splitID),
    () => app.createInvite(outsiderID, splitID),
    () => app.deleteExpense(outsiderID, splitID, genExpenseID()),
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
      const { app, writes } = fixture();
      await assert.rejects(
        () => app.createExpense(actorID, splitID, { ...expense, ...input }),
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
    const { app, writes } = fixture({ fetchCurrencyConversionRate: provider });
    await assert.rejects(() =>
      app.createExpense(actorID, splitID, { ...expense, currency: "USD" }),
    );
    assert.equal(writes.length, 0);
  }
});

await test("invite preview exposes metadata without loading expenses", async () => {
  const { app } = fixture({
    getSplitWithData: () => {
      assert.fail("Unexpected aggregate read");
    },
  });
  assert.deepEqual(await app.previewInvite(inviteID), { split });
});

await test("expired and missing invites are rejected before consumption", async () => {
  for (const value of [undefined, { ...invite, expiresAt: now }]) {
    const { app } = fixture({
      findInviteForSplit: () => Promise.resolve(value),
      consumeInviteForSplit: () => {
        assert.fail("Unexpected invite consumption");
      },
    });
    await assert.rejects(() => app.previewInvite(inviteID), {
      code: "not_found",
    });
    await assert.rejects(() => app.acceptInvite(actorID, inviteID), {
      code: "not_found",
    });
  }
});

await test("invite acceptance delegates consumption and membership to one atomic operation", async () => {
  let consumed = false;
  const { app } = fixture({
    consumeInviteForSplit: (value, userID) => {
      assert.deepEqual(value, invite);
      assert.equal(userID, outsiderID);
      const accepted = !consumed;
      consumed = true;
      return Promise.resolve(accepted);
    },
  });
  assert.deepEqual(await app.acceptInvite(outsiderID, inviteID), { splitID });
  await assert.rejects(() => app.acceptInvite(outsiderID, inviteID), {
    code: "not_found",
  });
});

await test("split creation stamps the actor and rejects invalid names", async () => {
  const { app } = fixture({
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
    await app.createSplit(actorID, { name: "Trip", currency: "EUR" }),
    { id: splitID },
  );
  await assert.rejects(
    () => app.createSplit(actorID, { name: "x".repeat(65), currency: "EUR" }),
    { code: "invalid_input" },
  );
});

await test("provisioning saves the profile under the resolved application identity", async () => {
  const cognitoID = asCognitoUserID("12345678-1234-4123-8123-123456789abc");
  let saved = false;
  const { app } = fixture({
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
    await app.provisionAuthenticatedUser({
      cognitoID,
      email: "user@example.com",
      name: "User",
    }),
    { userID: actorID },
  );
  assert.equal(saved, true);
});

await test("HTTP adapter maps expected errors and preserves unexpected failures", async () => {
  await assert.rejects(
    () =>
      runApplication(() =>
        Promise.reject(new ApplicationError("not_found", "Missing")),
      ),
    (error: unknown) => error instanceof Response && error.status === 404,
  );
  const failure = new Error("Storage unavailable");
  await assert.rejects(
    () => runApplication(() => Promise.reject(failure)),
    (error: unknown) => error === failure,
  );
  const result = await runFormApplication(() =>
    Promise.reject(
      new ApplicationError("invalid_input", "Invalid payer", {
        payer: ["Invalid payer"],
      }),
    ),
  );
  assert.ok(result.response);
  assert.ok(result.response.init);
  assert.equal(result.response.init.status, 400);
  assert.deepEqual(result.response.data.errors.fieldErrors, {
    payer: ["Invalid payer"],
  });
});

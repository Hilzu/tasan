import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genSplitID, genUserID } from "@tasan/common/id";
import type {
  createSplit,
  findUsersSplits,
  getSplit,
  getSplitUser,
  getSplitWithData,
  getUsers,
  SplitWithData,
} from "@tasan/data";

const actorID = genUserID();
const splitID = genSplitID();
const persistenceMock = {
  cache: true,
  exports: {
    createSplit: mock.fn<typeof createSplit>(() =>
      Promise.resolve({ id: splitID }),
    ),
    findUsersSplits: mock.fn<typeof findUsersSplits>(),
    getSplit: mock.fn<typeof getSplit>(),
    getSplitUser: mock.fn<typeof getSplitUser>(() =>
      Promise.resolve(undefined),
    ),
    getSplitWithData: mock.fn<typeof getSplitWithData>(),
    getUsers: mock.fn<typeof getUsers>(),
  },
};
mock.module("@tasan/data", persistenceMock);
const {
  createSplit: create,
  getSplit: get,
  requireMembership,
  requireSplit,
} = await import("~/.server/services/splits");
const {
  createSplit: save,
  getSplitUser: membership,
  getSplitWithData: read,
  getUsers: users,
} = persistenceMock.exports;

beforeEach(() => {
  for (const dependency of Object.values(persistenceMock.exports)) {
    dependency.mock.restore();
    dependency.mock.resetCalls();
  }
});

await test("split creation stamps the actor", async () => {
  assert.deepEqual(await create(actorID, { name: "Trip", currency: "EUR" }), {
    id: splitID,
  });
  assert.deepEqual(save.mock.calls[0].arguments, [
    { name: "Trip", currency: "EUR", createdBy: actorID },
  ]);
});

await test("split creation rejects invalid names before writing", async () => {
  await assert.rejects(
    () => create(actorID, { name: "x".repeat(65), currency: "EUR" }),
    { code: "invalid_input" },
  );
  assert.equal(save.mock.callCount(), 0);
});

await test("membership checks reject non-members", async () => {
  await assert.rejects(() => requireMembership(actorID, splitID), {
    code: "not_found",
  });
  assert.deepEqual(membership.mock.calls[0].arguments, [actorID, splitID]);
});

await test("membership checks allow existing members", async () => {
  membership.mock.mockImplementation(() =>
    Promise.resolve({ userID: actorID, splitID, createdBy: actorID }),
  );
  await requireMembership(actorID, splitID);
  assert.deepEqual(membership.mock.calls[0].arguments, [actorID, splitID]);
});

await test("split metadata is loaded from persistence", async () => {
  const split = {
    id: splitID,
    name: "Trip",
    currency: "EUR" as const,
    createdBy: actorID,
    createdAt: new Date(),
  };
  persistenceMock.exports.getSplit.mock.mockImplementation(() =>
    Promise.resolve(split),
  );
  assert.deepEqual(await requireSplit(splitID), split);
  assert.deepEqual(persistenceMock.exports.getSplit.mock.calls[0].arguments, [
    splitID,
  ]);
});

const splitData: SplitWithData = {
  id: splitID,
  name: "Trip",
  currency: "EUR",
  createdBy: actorID,
  createdAt: new Date(),
  userIDs: new Set([actorID]),
  expenses: [],
};

await test("reading a split authorizes against the loaded memberships without a separate read", async () => {
  read.mock.mockImplementation(() => Promise.resolve(splitData));
  users.mock.mockImplementation(() => Promise.resolve([]));
  assert.deepEqual(await get(actorID, splitID), {
    split: splitData,
    users: [],
  });
  assert.equal(membership.mock.callCount(), 0);
  assert.deepEqual(users.mock.calls[0].arguments, [splitData.userIDs]);
});

await test("reading a split rejects missing splits and non-members without loading users", async () => {
  for (const value of [
    undefined,
    { ...splitData, userIDs: new Set<typeof actorID>() },
  ]) {
    read.mock.mockImplementation(() => Promise.resolve(value));
    await assert.rejects(() => get(actorID, splitID), { code: "not_found" });
  }
  assert.equal(users.mock.callCount(), 0);
  assert.equal(membership.mock.callCount(), 0);
});

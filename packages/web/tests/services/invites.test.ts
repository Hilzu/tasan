import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genInviteID, genSplitID, genUserID } from "@tasan/common/id";
import type {
  consumeInviteForSplit,
  createInviteForSplit,
  findInviteForSplit,
  Split,
} from "@tasan/data";

import { ApplicationError } from "~/.server/services/errors";
import type {
  requireMembership,
  requireSplit,
} from "~/.server/services/splits";

const actorID = genUserID();
const splitID = genSplitID();
const now = new Date("2026-10-01T12:00:00Z");
const split: Split = {
  id: splitID,
  name: "Trip",
  currency: "EUR",
  createdBy: actorID,
  createdAt: now,
};
const invite = {
  id: genInviteID(),
  splitID,
  createdBy: actorID,
  expiresAt: new Date(now.getTime() + 1000),
};
const persistenceMock = {
  cache: true,
  exports: {
    createInviteForSplit: mock.fn<typeof createInviteForSplit>(() =>
      Promise.resolve({ id: invite.id }),
    ),
    findInviteForSplit: mock.fn<typeof findInviteForSplit>(() =>
      Promise.resolve(invite),
    ),
    consumeInviteForSplit: mock.fn<typeof consumeInviteForSplit>(() =>
      Promise.resolve(true),
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
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/data", persistenceMock);
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("../../app/.server/services/splits.ts", splitMock);
const { acceptInvite, createInvite, previewInvite } =
  await import("~/.server/services/invites");
const { findInviteForSplit: find, consumeInviteForSplit: consume } =
  persistenceMock.exports;

beforeEach(() => {
  for (const dependency of [
    ...Object.values(persistenceMock.exports),
    ...Object.values(splitMock.exports),
  ]) {
    dependency.mock.restore();
    dependency.mock.resetCalls();
  }
});

await test("invite creation stops when membership is rejected", async () => {
  splitMock.exports.requireMembership.mock.mockImplementation(() =>
    Promise.reject(new ApplicationError("not_found", "Split not found.")),
  );
  await assert.rejects(() => createInvite(actorID, splitID), {
    code: "not_found",
  });
  assert.deepEqual(
    splitMock.exports.requireMembership.mock.calls[0].arguments,
    [actorID, splitID],
  );
  assert.equal(splitMock.exports.requireSplit.mock.callCount(), 0);
  assert.equal(
    persistenceMock.exports.createInviteForSplit.mock.callCount(),
    0,
  );
});

await test("invite preview reads only the split metadata", async (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  assert.deepEqual(await previewInvite(invite.id), { split });
  assert.deepEqual(find.mock.calls[0].arguments, [invite.id]);
  assert.deepEqual(splitMock.exports.requireSplit.mock.calls[0].arguments, [
    splitID,
  ]);
});

await test("expired and missing invites are rejected before consumption", async (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  for (const value of [undefined, { ...invite, expiresAt: now }]) {
    find.mock.mockImplementation(() => Promise.resolve(value));
    await assert.rejects(() => previewInvite(invite.id), { code: "not_found" });
    await assert.rejects(() => acceptInvite(actorID, invite.id), {
      code: "not_found",
    });
  }
  assert.equal(splitMock.exports.requireSplit.mock.callCount(), 0);
  assert.equal(consume.mock.callCount(), 0);
});

await test("invite acceptance delegates consumption and membership to one atomic operation", async (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  const userID = genUserID();
  assert.deepEqual(await acceptInvite(userID, invite.id), { splitID });
  assert.deepEqual(consume.mock.calls[0].arguments, [invite, userID]);
});

await test("invite acceptance rejects an invitation already consumed", async (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  consume.mock.mockImplementation(() => Promise.resolve(false));
  await assert.rejects(() => acceptInvite(actorID, invite.id), {
    code: "not_found",
  });
});

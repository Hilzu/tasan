import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genSessionID, genUserID } from "@tasan/common/id";
import type * as Data from "@tasan/data";
import { createCookie, createSession } from "react-router";

const now = new Date("2026-11-03T12:00:00Z");
const hour = 3600_000;
const day = 24 * hour;
const stored = new Map<string, Data.Session>();
const create = mock.fn<typeof Data.createSession>((data) => {
  const id = genSessionID();
  stored.set(id, { ...data, id });
  return Promise.resolve({ id });
});
const read = mock.fn<typeof Data.getSession>((id) =>
  Promise.resolve(stored.get(id)),
);
const remove = mock.fn<typeof Data.deleteSession>((id) => {
  stored.delete(id);
  return Promise.resolve();
});
const refresh = mock.fn<typeof Data.refreshSession>(() =>
  Promise.resolve(true),
);
const persistenceMock = {
  cache: true,
  exports: {
    createSession: create,
    getSession: read,
    deleteSession: remove,
    refreshSession: refresh,
  },
};
mock.module("@tasan/data", persistenceMock);
const secretsMock = {
  cache: true,
  exports: { cookieSignSecrets: ["test-secret"] },
};
mock.module("~/.server/secrets", secretsMock);
const configMock = {
  cache: true,
  exports: { originURL: new URL("https://tasan.app") },
};
mock.module("~/config", configMock);
const { getSession, commitSession, refreshSessionCookie, destroySession } =
  await import("~/.server/sessions");
const cookie = createCookie("__session", { secrets: ["test-secret"] });
const cookieID = async (value: string) => {
  const id: unknown = await cookie.parse(value);
  assert.equal(typeof id, "string");
  return id as string;
};

beforeEach(() => {
  stored.clear();
  for (const fn of [create, read, remove, refresh]) {
    fn.mock.restore();
    fn.mock.resetCalls();
  }
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now });
});

await test("sign-in sets a seven-day cookie and a thirty-day backend cap", async () => {
  const header = await commitSession(createSession({ userID: genUserID() }));
  const record = stored.get(await cookieID(header));
  assert.equal(record?.expiresAt.getTime(), now.getTime() + 7 * day);
  assert.equal(record.absoluteExpiresAt?.getTime(), now.getTime() + 30 * day);
  assert.match(header, /Max-Age=604800/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
});

await test("activity renews both the backend and cookie only after an hour", async () => {
  const header = await commitSession(createSession({ userID: genUserID() }));
  const id = await cookieID(header);
  const session = await getSession(header);
  assert.equal(await refreshSessionCookie(session), undefined);
  mock.timers.tick(hour - 1);
  assert.equal(await refreshSessionCookie(session), undefined);
  mock.timers.tick(1);
  const renewed = await refreshSessionCookie(session);
  assert.ok(renewed);
  assert.equal(await cookieID(renewed), id);
  assert.equal(refresh.mock.callCount(), 1);
  assert.deepEqual(refresh.mock.calls[0].arguments, [
    id,
    new Date(Date.now() + 7 * day),
    new Date(now.getTime() + 7 * day),
  ]);
  assert.match(renewed, /Max-Age=604800/);
});

await test("renewal is capped at thirty days and stops extending near that deadline", async () => {
  const header = await commitSession(createSession({ userID: genUserID() }));
  const id = await cookieID(header);
  const record = stored.get(id);
  assert.ok(record);
  mock.timers.tick(28 * day);
  stored.set(id, { ...record, expiresAt: new Date(Date.now() + day) });
  const renewed = await refreshSessionCookie(await getSession(header));
  assert.ok(renewed);
  assert.equal(
    refresh.mock.calls[0].arguments[1].getTime(),
    now.getTime() + 30 * day,
  );
  assert.match(renewed, /Max-Age=172800/);
  assert.ok(record.absoluteExpiresAt);
  stored.set(id, { ...record, expiresAt: record.absoluteExpiresAt });
  assert.equal(await refreshSessionCookie(await getSession(header)), undefined);
  assert.equal(refresh.mock.callCount(), 1);
});

await test("legacy sessions cannot be extended past their original deadline", async () => {
  const id = genSessionID();
  const expiresAt = new Date(Date.now() + 14 * day);
  stored.set(id, { id, userID: genUserID(), expiresAt });
  const header = await cookie.serialize(id);
  mock.timers.tick(10 * day);
  const session = await getSession(header);
  assert.equal(await refreshSessionCookie(session), undefined);
  const committed = await commitSession(session);
  const record = stored.get(await cookieID(committed));
  assert.equal(record?.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(record.absoluteExpiresAt?.getTime(), expiresAt.getTime());
});

await test("anonymous login state expires in ten minutes and is never renewed", async () => {
  const header = await commitSession(
    createSession({ authState: "state", authNonce: "nonce" }),
  );
  const record = stored.get(await cookieID(header));
  assert.equal(record?.expiresAt.getTime(), now.getTime() + 10 * 60_000);
  assert.equal(record.absoluteExpiresAt, undefined);
  assert.equal(await refreshSessionCookie(await getSession(header)), undefined);
  assert.equal(refresh.mock.callCount(), 0);
});

await test("authentication rotates the anonymous ID and starts the thirty-day cap at sign-in", async () => {
  const header = await commitSession(createSession({ authState: "state" }));
  const originalID = await cookieID(header);
  mock.timers.tick(5 * 60_000);
  const session = await getSession(header);
  session.set("userID", genUserID());
  session.unset("authState");
  const signedIn = await commitSession(session);
  const id = await cookieID(signedIn);
  assert.notEqual(id, originalID);
  assert.equal(stored.has(originalID), false);
  assert.equal(
    stored.get(id)?.absoluteExpiresAt?.getTime(),
    Date.now() + 30 * day,
  );
});

await test("missing or expired backend records yield a fresh anonymous session with no stale ID", async () => {
  const id = genSessionID();
  const session = await getSession(await cookie.serialize(id));
  assert.equal(session.id, "");
  assert.equal(session.get("userID"), undefined);
  assert.equal(await refreshSessionCookie(session), undefined);
  assert.equal(refresh.mock.callCount(), 0);
});

await test("revocation during a request suppresses renewal and logout clears the cookie", async () => {
  const header = await commitSession(createSession({ userID: genUserID() }));
  const session = await getSession(header);
  mock.timers.tick(hour);
  refresh.mock.mockImplementation(() => Promise.resolve(false));
  assert.equal(await refreshSessionCookie(session), undefined);
  const cleared = await destroySession(session);
  assert.equal(stored.size, 0);
  assert.match(cleared, /__session=;/);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  assert.equal((await getSession(header)).get("userID"), undefined);
});

await test("invalid signatures do not trigger a database lookup or create sessions", async () => {
  assert.equal((await getSession("__session=invalid")).id, "");
  assert.equal((await getSession(null)).id, "");
  assert.equal(read.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

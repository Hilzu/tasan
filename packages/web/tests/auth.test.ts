import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genUserID } from "@tasan/common/id";
import {
  createSession,
  type MiddlewareFunction,
  RouterContextProvider,
} from "react-router";

import type { getSession } from "~/.server/sessions";

const readSession = mock.fn<typeof getSession>(() =>
  Promise.resolve(createSession()),
);
const sessionMock = { cache: true, exports: { getSession: readSession } };
mock.module("~/.server/sessions", sessionMock);
const {
  sessionMiddleware,
  requireAuthentication,
  sessionContext,
  authenticatedSessionContext,
} = await import("~/.server/auth");

beforeEach(() => {
  readSession.mock.restore();
  readSession.mock.resetCalls();
});

const args = (
  request: Request,
  url = new URL(request.url),
): Parameters<MiddlewareFunction<Response>>[0] => ({
  request,
  url,
  context: new RouterContextProvider(),
  params: {},
  pattern: "/splits",
});
const next = () => Promise.resolve(new Response());

for (const method of ["GET", "POST"]) {
  await test(`unauthenticated ${method} redirects to the normalized destination`, async () => {
    const input = args(
      new Request("https://tasan.app/splits.data?_routes=child&sort=name", {
        method,
      }),
      new URL("https://tasan.app/splits?sort=name"),
    );
    await sessionMiddleware(input, next);
    await assert.rejects(
      async () => requireAuthentication(input, next),
      (error: unknown) => {
        assert.ok(error instanceof Response);
        assert.equal(error.status, 302);
        const redirectLocation = error.headers.get("location");
        assert.ok(redirectLocation);
        const location = new URL(redirectLocation, input.request.url);
        assert.equal(location.pathname, "/login");
        assert.equal(
          location.searchParams.get("redirect"),
          "/splits?sort=name",
        );
        return true;
      },
    );
  });
}

await test("session is read once and reused by authentication and multiple handlers", async () => {
  const userID = genUserID();
  const session = createSession({ userID });
  readSession.mock.mockImplementation(() => Promise.resolve(session));
  const input = args(
    new Request("https://tasan.app/splits", {
      headers: { cookie: "session-cookie" },
    }),
  );
  await sessionMiddleware(input, next);
  await requireAuthentication(input, next);
  assert.equal(input.context.get(sessionContext), session);
  assert.equal(input.context.get(sessionContext), session);
  assert.deepEqual(input.context.get(authenticatedSessionContext), { userID });
  assert.equal(readSession.mock.callCount(), 1);
  assert.deepEqual(readSession.mock.calls[0].arguments, ["session-cookie"]);
});

await test("anonymous public requests work and request contexts remain isolated", async () => {
  const first = args(new Request("https://tasan.app/"));
  const second = args(new Request("https://tasan.app/"));
  await sessionMiddleware(first, next);
  await sessionMiddleware(second, next);
  first.context.get(sessionContext).set("userID", genUserID());
  assert.equal(second.context.get(sessionContext).get("userID"), undefined);
});

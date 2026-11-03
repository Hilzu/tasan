import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genUserID } from "@tasan/common/id";
import { getLogger } from "@tasan/common/logging";
import {
  createSession,
  type MiddlewareFunction,
  RouterContextProvider,
} from "react-router";

import type { getSession } from "~/.server/sessions";

const readSession = mock.fn<typeof getSession>(() =>
  Promise.resolve(createSession()),
);
const refreshCookie = mock.fn(
  (): Promise<string | undefined> => Promise.resolve(undefined),
);
const sessionMock = {
  cache: true,
  exports: { getSession: readSession, refreshSessionCookie: refreshCookie },
};
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
  refreshCookie.mock.restore();
  refreshCookie.mock.resetCalls();
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

await test("renewal appends the cookie without replacing unrelated cookies and prevents caching", async () => {
  refreshCookie.mock.mockImplementation(() =>
    Promise.resolve("__session=renewed"),
  );
  const response = await sessionMiddleware(
    args(new Request("https://tasan.app/splits")),
    () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            Location: "/splits/123",
            "Set-Cookie": "preference=light",
            "Cache-Control": "public, max-age=3600",
          },
        }),
      ),
  );
  assert.ok(response instanceof Response);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/splits/123");
  assert.deepEqual(response.headers.getSetCookie(), [
    "preference=light",
    "__session=renewed",
  ]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

await test("failed renewal logs the error and preserves a completed action's response", async (t) => {
  const failure = new Error("Session renewal database write failed");
  const errorLog = t.mock.method(getLogger(), "error", () => undefined);
  const session = createSession({ userID: genUserID() });
  readSession.mock.mockImplementation(() => Promise.resolve(session));
  let completedActions = 0;
  refreshCookie.mock.mockImplementation(() => {
    assert.equal(completedActions, 1);
    return Promise.reject(failure);
  });
  const successfulResponse = new Response(null, {
    status: 302,
    headers: {
      Location: "/splits/newly-created",
      "Set-Cookie": "preference=light",
      "Cache-Control": "private, no-cache, max-age=0",
    },
  });

  const response = await sessionMiddleware(
    args(new Request("https://tasan.app/splits/new", { method: "POST" })),
    () => {
      completedActions++;
      return Promise.resolve(successfulResponse);
    },
  );

  assert.equal(completedActions, 1);
  assert.equal(response, successfulResponse);
  assert.equal(successfulResponse.status, 302);
  assert.equal(
    successfulResponse.headers.get("location"),
    "/splits/newly-created",
  );
  assert.deepEqual(successfulResponse.headers.getSetCookie(), [
    "preference=light",
  ]);
  assert.equal(
    successfulResponse.headers.get("cache-control"),
    "private, no-cache, max-age=0",
  );
  assert.equal(refreshCookie.mock.callCount(), 1);
  assert.equal(errorLog.mock.callCount(), 1);
  assert.deepEqual(errorLog.mock.calls[0].arguments, [
    "Session renewal failed",
    { error: failure },
  ]);
});

for (const cookie of [
  "__session=logged-in",
  "__session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
]) {
  await test(`explicit session cookie takes precedence: ${cookie}`, async () => {
    const response = await sessionMiddleware(
      args(new Request("https://tasan.app/logout")),
      () =>
        Promise.resolve(
          new Response(null, { headers: { "Set-Cookie": cookie } }),
        ),
    );
    assert.ok(response instanceof Response);
    assert.deepEqual(response.headers.getSetCookie(), [cookie]);
    assert.equal(refreshCookie.mock.callCount(), 0);
  });
}

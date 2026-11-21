import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { UserID } from "@tasan/common/id";
import type { Session } from "react-router";
import {
  createContext,
  createSession,
  RouterContextProvider,
} from "react-router";

interface SessionData {
  userID?: UserID;
}

const sessionContext = createContext<Session<SessionData>>();
const destroySession = mock.fn(() => Promise.resolve("session=;"));
const buildLogoutURL = mock.fn(() => new URL("https://auth.tasan.app/logout"));

const authMock = {
  cache: true,
  exports: { sessionContext },
};
mock.module("~/.server/auth", authMock);
const openidMock = {
  cache: true,
  exports: { buildLogoutURL },
};
mock.module("~/.server/openid", openidMock);
const sessionsMock = {
  cache: true,
  exports: { destroySession },
};
mock.module("~/.server/sessions", sessionsMock);
const configMock = {
  cache: true,
  exports: { originURL: new URL("https://tasan.app") },
};
mock.module("~/config", configMock);

const { action, loader } = await import("~/routes/logout");

const actionArgs = (request: Request) => {
  const context = new RouterContextProvider();
  context.set(sessionContext, createSession<SessionData>());
  const url = new URL(request.url);
  return {
    context,
    params: {},
    request,
    url,
    pattern: "/logout",
  } satisfies Parameters<typeof action>[0];
};

await test("GET logout is rejected without changing the session", () => {
  assert.throws(
    () => {
      loader();
    },
    (error: unknown) => error instanceof Response && error.status === 405,
  );
  assert.equal(destroySession.mock.callCount(), 0);
});

await test("cross-origin and origin-less logout POSTs are rejected", async () => {
  for (const origin of ["https://evil.example", null]) {
    const headers = origin ? { origin } : undefined;
    await assert.rejects(
      action(
        actionArgs(
          new Request("https://tasan.app/logout", {
            method: "POST",
            headers,
          }),
        ),
      ),
      (error: unknown) => error instanceof Response && error.status === 403,
    );
  }
  assert.equal(destroySession.mock.callCount(), 0);
});

await test("same-origin logout destroys the app session and redirects to Cognito", async () => {
  const response = await action(
    actionArgs(
      new Request("https://tasan.app/logout", {
        method: "POST",
        headers: { origin: "https://tasan.app" },
      }),
    ),
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://auth.tasan.app/logout",
  );
  assert.equal(response.headers.get("set-cookie"), "session=;");
  assert.equal(destroySession.mock.callCount(), 1);
});

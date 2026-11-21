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
  cognitoUsername?: string;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
}

const sessionContext = createContext<Session<SessionData>>();
const getTokens = mock.fn((): unknown => {
  throw new Error("Unexpected token exchange");
});
const provisionAuthenticatedUser = mock.fn((): unknown => {
  throw new Error("Unexpected user provisioning");
});
const commitSession = mock.fn((): unknown => {
  throw new Error("Unexpected session commit");
});

const authMock = {
  cache: true,
  exports: { sessionContext },
};
mock.module("~/.server/auth", authMock);
const openidMock = {
  cache: true,
  exports: { getTokens },
};
mock.module("~/.server/openid", openidMock);
const usersMock = {
  cache: true,
  exports: { provisionAuthenticatedUser },
};
mock.module("~/.server/services/users", usersMock);
const sessionsMock = {
  cache: true,
  exports: { commitSession },
};
mock.module("~/.server/sessions", sessionsMock);
const configMock = {
  cache: true,
  exports: { originURL: new URL("https://tasan.app") },
};
mock.module("~/config", configMock);

const { loader } = await import("~/routes/auth-callback");

const callbackArgs = (session: Session<SessionData>) => {
  const context = new RouterContextProvider();
  context.set(sessionContext, session);
  const request = new Request("https://tasan.app/auth-callback?code=code");
  const url = new URL(request.url);
  return {
    context,
    params: {},
    request,
    url,
    pattern: "/auth-callback",
  } satisfies Parameters<typeof loader>[0];
};

for (const sessionData of [
  {},
  { authNonce: "nonce" },
  { authState: "state" },
]) {
  await test(`callback rejects missing OAuth state or nonce: ${JSON.stringify(sessionData)}`, async () => {
    const session = createSession<SessionData>(sessionData);
    await assert.rejects(
      loader(callbackArgs(session)),
      (error: unknown) => error instanceof Response && error.status === 400,
    );
    assert.equal(getTokens.mock.callCount(), 0);
    assert.equal(provisionAuthenticatedUser.mock.callCount(), 0);
    assert.equal(commitSession.mock.callCount(), 0);
  });
}

await test("callback stores the Cognito username for account checks", async () => {
  getTokens.mock.mockImplementation(() => ({
    claims: () => ({
      sub: "6b7f1c8e-6a51-4f43-9d55-1c1a8f1f6e2b",
      email: "alice@example.com",
      "cognito:username": "alice",
    }),
  }));
  provisionAuthenticatedUser.mock.mockImplementation(() =>
    Promise.resolve({ userID: "usr_test" }),
  );
  commitSession.mock.mockImplementation(() => Promise.resolve("cookie"));
  const session = createSession<SessionData>({
    authState: "state",
    authNonce: "nonce",
    authRedirect: "/splits",
  });
  const response = await loader(callbackArgs(session));
  assert.equal(response.headers.get("location"), "/splits");
  assert.equal(session.get("cognitoUsername"), "alice");
  assert.equal(session.get("authState"), undefined);
});

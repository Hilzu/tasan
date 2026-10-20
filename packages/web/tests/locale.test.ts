import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

import { genUserID } from "@tasan/common/id";
import type { updateUserSettings } from "@tasan/data";
import { createSession, RouterContextProvider } from "react-router";

import type { getSession } from "~/.server/sessions";

const userID = genUserID();
const writeSettings = mock.fn<typeof updateUserSettings>(() =>
  Promise.resolve(),
);
const persistenceMock = {
  cache: true,
  exports: {
    updateUserSettings: writeSettings,
    ensureCognitoUser: mock.fn(),
    putUser: mock.fn(),
  },
};
mock.module("@tasan/data", persistenceMock);
const sessionMock = {
  cache: true,
  exports: {
    getSession: mock.fn<typeof getSession>(() =>
      Promise.resolve(createSession()),
    ),
  },
};
mock.module("~/.server/sessions", sessionMock);
const { sessionContext } = await import("~/.server/auth");
const { getLocale } = await import("~/.server/locale");
const { canonicalLocale, localeOptions } = await import("~/domain/locale");
const { action, middleware } = await import("~/routes/settings");

beforeEach(() => {
  writeSettings.mock.restore();
  writeSettings.mock.resetCalls();
});

const request = (language = "en-GB,en;q=0.9") =>
  new Request("https://tasan.app/settings", {
    headers: { "accept-language": language },
  });

await test("locale options are supported, canonical locales", () => {
  for (const [locale] of localeOptions)
    assert.equal(canonicalLocale(locale), locale);
  assert.equal(canonicalLocale("fi-fi"), "fi-FI");
  for (const value of [
    null,
    undefined,
    "",
    "en_US",
    "*",
    "xx-XX",
    "a".repeat(101),
  ]) {
    assert.equal(canonicalLocale(value), undefined);
  }
});

await test("account preference takes priority over browser language", () => {
  assert.equal(getLocale(request(), "fi-FI"), "fi-FI");
  assert.equal(getLocale(request("ja-JP"), "fi-FI"), "fi-FI");
});

await test("missing or invalid profile preference falls back to browser language", () => {
  for (const preference of [undefined, "", "en_US", "xx-XX"]) {
    assert.equal(getLocale(request(), preference), "en-GB");
  }
});

await test("missing or unusable browser language has a deterministic SSR fallback", () => {
  for (const language of ["", "*", "xx-XX", "en_US"])
    assert.equal(getLocale(request(language)), "en-US");
});

await test("locale cookies are ignored in favor of account and browser preferences", () => {
  const input = request();
  input.headers.set("cookie", "locale=ImZpLUZJIiI%3D");
  assert.equal(getLocale(input), "en-GB");
  assert.equal(getLocale(input, "ja-JP"), "ja-JP");
});

const save = async (locale: string | null, authenticated = true) => {
  const form = new FormData();
  if (locale !== null) form.set("locale", locale);
  // A submitted user ID must never select whose profile is updated.
  form.set("userID", genUserID());
  const input = new Request("https://tasan.app/settings", {
    method: "POST",
    body: form,
  });
  const context = new RouterContextProvider();
  context.set(sessionContext, createSession(authenticated ? { userID } : {}));
  const args = {
    request: input,
    url: new URL(input.url),
    params: {},
    context,
    pattern: "/settings",
  };
  for (const handler of middleware)
    await handler(args, () => Promise.resolve(new Response()));
  return action(args);
};

await test("saving canonicalizes and updates only the authenticated account, without a locale cookie", async () => {
  const result = await save("fi-fi");
  assert.ok(result instanceof Response);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "/settings?saved");
  assert.equal(result.headers.get("set-cookie"), null);
  assert.deepEqual(
    writeSettings.mock.calls.map(({ arguments: args }) => args),
    [[userID, { locale: "fi-FI" }]],
  );
});

await test("browser default removes the account override", async () => {
  const result = await save("");
  assert.ok(result instanceof Response);
  assert.deepEqual(writeSettings.mock.calls[0].arguments, [
    userID,
    { locale: undefined },
  ]);
});

await test("invalid or missing preference is rejected without writing the profile", async () => {
  for (const value of [null, "en_US", "*", "xx-XX"]) {
    const result = await save(value);
    assert.ok(!(result instanceof Response));
    assert.equal(result.init?.status, 400);
    assert.deepEqual(result.data.errors.locale, ["Choose a valid locale."]);
  }
  assert.equal(writeSettings.mock.callCount(), 0);
});

await test("unauthenticated GET and POST settings requests redirect to login", async () => {
  await assert.rejects(save("fi-FI", false), (error: unknown) => {
    assert.ok(error instanceof Response);
    assert.equal(error.status, 302);
    assert.equal(error.headers.get("location"), "/login?redirect=%2Fsettings");
    return true;
  });
  const input = request();
  const context = new RouterContextProvider();
  context.set(sessionContext, createSession());
  const args = {
    request: input,
    url: new URL(input.url),
    params: {},
    context,
    pattern: "/settings",
  };
  await assert.rejects(
    async () => {
      for (const handler of middleware)
        await handler(args, () => Promise.resolve(new Response()));
    },
    (error: unknown) => error instanceof Response && error.status === 302,
  );
  assert.equal(writeSettings.mock.callCount(), 0);
});

await test("a failed profile write cannot report a successful save", async () => {
  const error = new Error("Write failed");
  writeSettings.mock.mockImplementationOnce(() => Promise.reject(error));
  await assert.rejects(save("fi-FI"), error);
});

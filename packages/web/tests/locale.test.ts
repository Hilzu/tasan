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
const { canonicalLocale } = await import("~/domain/locale");
const { getLocaleOptions, resolveLocaleOption, searchLocales } =
  await import("~/.server/locales");
const localeOptions = getLocaleOptions();
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
  for (const { value, label } of localeOptions) {
    assert.equal(canonicalLocale(value), value);
    assert.equal(resolveLocaleOption(label), value, label);
  }
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

await test("the picker covers the full supported Unicode catalog and default regions", async () => {
  const { default: catalog } = await import("cldr-core/availableLocales.json");
  const options = new Set(localeOptions.map(({ value }) => value));
  for (const locale of catalog.availableLocales.full) {
    const canonical = canonicalLocale(locale);
    if (canonical) assert.ok(options.has(canonical), locale);
  }
  for (const locale of [
    "fi-FI",
    "ja-JP",
    "en-AU",
    "es-MX",
    "ar-EG",
    "hi-IN",
    "uk-UA",
  ]) {
    assert.ok(options.has(locale), locale);
  }
  assert.equal(options.size, localeOptions.length);
});

await test("readable English and native locale names resolve without entering codes", () => {
  const finnish = localeOptions.find(({ value }) => value === "fi-FI");
  assert.ok(finnish);
  assert.match(finnish.label, /Finnish/);
  assert.match(finnish.label, /suomi/);
  assert.equal(resolveLocaleOption(finnish.label), "fi-FI");
  assert.equal(resolveLocaleOption("Browser default"), "");
  assert.equal(resolveLocaleOption(""), "");
});

await test("supported tags outside the catalog and Unicode extensions are accepted", async () => {
  for (const locale of ["fi-JP", "en-AU-u-hc-h23"]) {
    assert.equal(resolveLocaleOption(locale), locale);
    const result = await save(locale);
    assert.ok(result instanceof Response);
    assert.deepEqual(writeSettings.mock.calls.at(-1)?.arguments, [
      userID,
      { locale },
    ]);
  }
});

await test("saving a readable picker selection updates the canonical account locale", async () => {
  const option = localeOptions.find(({ value }) => value === "es-MX");
  assert.ok(option);
  const result = await save(option.label);
  assert.ok(result instanceof Response);
  assert.deepEqual(writeSettings.mock.calls[0].arguments, [
    userID,
    { locale: "es-MX" },
  ]);
});

await test("empty searches return no catalog and suggestions are bounded", () => {
  assert.deepEqual(searchLocales(""), { options: [], total: 0 });
  assert.deepEqual(searchLocales("  "), { options: [], total: 0 });
  const results = searchLocales("English");
  assert.ok(results.total > 20);
  assert.equal(results.options.length, 20);
});

await test("search finds English names, native names, country combinations, and supported custom tags", () => {
  for (const [query, value] of [
    ["Finnish Finland", "fi-FI"],
    ["suomi", "fi-FI"],
    ["English Australia", "en-AU"],
    ["espanol Mexico", "es-MX"],
    ["fi-JP", "fi-JP"],
  ]) {
    assert.ok(
      searchLocales(query).options.some((option) => option.value === value),
      query,
    );
  }
});

await test("Settings sends no locale catalog until a search is requested", async () => {
  const { loader } = await import("~/routes/settings");
  const input = request();
  const result = loader({
    request: input,
    url: new URL(input.url),
    context: new RouterContextProvider(),
    params: {},
    pattern: "/settings",
  });
  assert.deepEqual(result.options, []);
  assert.equal(result.total, 0);
});

await test("public suggestion responses are bounded and cacheable without a session", async () => {
  const { loader } = await import("~/routes/locale-options");
  const input = new Request("https://tasan.app/locale-options?q=English");
  const result = loader({
    request: input,
    url: new URL(input.url),
    context: new RouterContextProvider(),
    params: {},
    pattern: "/locale-options",
  });
  assert.equal(result.data.options.length, 20);
  assert.ok(result.data.total > 20);
  assert.equal(
    new Headers(result.init?.headers).get("cache-control"),
    "public, max-age=86400",
  );
});

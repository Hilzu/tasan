import assert from "node:assert/strict";
import { test } from "node:test";

import { RouterContextProvider } from "react-router";

import { getLocale, localeCookie } from "~/.server/locale";
import { canonicalLocale, localeOptions } from "~/domain/locale";
import { action } from "~/routes/settings";

const request = (cookie?: string, language = "en-GB,en;q=0.9") =>
  new Request("https://tasan.app/settings", {
    headers: { "accept-language": language, ...(cookie ? { cookie } : {}) },
  });

await test("regional format options are supported, canonical locales", () => {
  for (const [locale] of localeOptions) {
    assert.equal(canonicalLocale(locale), locale);
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

await test("saved preference takes priority over browser language", async () => {
  const cookie = await localeCookie.serialize("fi-FI");
  assert.deepEqual(await getLocale(request(cookie)), {
    locale: "fi-FI",
    preference: "fi-FI",
  });
});

await test("missing, malformed, or invalid cookies fall back to browser language", async () => {
  for (const cookie of [
    undefined,
    "locale=garbage",
    "locale=%ZZ",
    await localeCookie.serialize("en_US"),
    await localeCookie.serialize({ locale: "fi" }),
  ]) {
    assert.deepEqual(await getLocale(request(cookie)), {
      locale: "en-GB",
      preference: "",
    });
  }
});

await test("missing or unusable browser language has a deterministic SSR fallback", async () => {
  for (const language of ["", "*", "xx-XX", "en_US"]) {
    assert.deepEqual(await getLocale(request(undefined, language)), {
      locale: "en-US",
      preference: "",
    });
  }
});

const save = async (locale: string | null, origin = "https://tasan.app") => {
  const form = new FormData();
  if (locale !== null) form.set("locale", locale);
  const input = new Request(`${origin}/settings`, {
    method: "POST",
    body: form,
  });
  return action({
    request: input,
    url: new URL(input.url),
    params: {},
    context: new RouterContextProvider(),
    pattern: "/settings",
  });
};

await test("saving canonicalizes and persists the preference for subsequent server requests", async () => {
  const result = await save("fi-fi");
  assert.ok(result instanceof Response);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "/settings?saved");
  const cookie = result.headers.get("set-cookie");
  assert.ok(cookie);
  for (const attribute of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=31536000",
  ]) {
    assert.ok(cookie.includes(attribute), attribute);
  }
  assert.deepEqual(await getLocale(request(cookie)), {
    locale: "fi-FI",
    preference: "fi-FI",
  });
});

await test("browser default clears the cookie and restores browser formatting", async () => {
  const result = await save("");
  assert.ok(result instanceof Response);
  const cookie = result.headers.get("set-cookie");
  assert.ok(cookie);
  assert.ok(cookie.includes("Max-Age=0"));
  assert.deepEqual(await getLocale(request(cookie)), {
    locale: "en-GB",
    preference: "",
  });
});

await test("invalid or missing preference is rejected without writing a cookie", async () => {
  for (const value of [null, "en_US", "*", "xx-XX"]) {
    const result = await save(value);
    assert.ok(!(result instanceof Response));
    assert.equal(result.init?.status, 400);
    assert.equal(result.data.error, "Choose a valid regional format.");
    assert.equal(new Headers(result.init.headers).get("set-cookie"), null);
  }
});

await test("local HTTP development can save the preference", async () => {
  const result = await save("ja-JP", "http://localhost:5173");
  assert.ok(result instanceof Response);
  const cookie = result.headers.get("set-cookie");
  assert.ok(cookie);
  assert.ok(!cookie.includes("Secure"));
  assert.equal((await getLocale(request(cookie))).locale, "ja-JP");
});

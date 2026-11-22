import assert from "node:assert/strict";
import { mock, test } from "node:test";

const authorizationCodeGrant = mock.fn<
  (config: unknown, callback: URL, checks: unknown) => Promise<object>
>(() => Promise.resolve({}));
const buildAuthorizationUrl = mock.fn(
  (_config: unknown, params: URLSearchParams) =>
    new URL(`https://auth.example.com/authorize?${params}`),
);
mock.module("openid-client", {
  cache: true,
  exports: {
    authorizationCodeGrant,
    buildAuthorizationUrl,
    buildEndSessionUrl: mock.fn(),
    discovery: mock.fn(() => Promise.resolve({})),
    randomNonce: () => "nonce",
    randomState: () => "state",
  },
});
mock.module("~/.server/secrets", {
  cache: true,
  exports: { authClientSecret: "client-secret" },
});
mock.module("~/config", {
  cache: true,
  exports: {
    authClientID: "client-id",
    authDisable: false,
    authServerURL: new URL("https://auth.example.com"),
    originURL: new URL("https://tasan.app"),
  },
});

const { buildAuthorizationURL, getTokens } = await import("~/.server/openid");

await test("token exchange uses the same public redirect URI as authorization", async () => {
  const { authorizationUrl } = buildAuthorizationURL();
  const currentURL = new URL(
    "https://internal.lambda-url.example/auth-callback?code=the-code&state=state&extra=one&extra=two",
  );
  await getTokens({ currentURL, state: "state", nonce: "nonce" });

  assert.equal(authorizationCodeGrant.mock.callCount(), 1);
  const [, callback, checks] = authorizationCodeGrant.mock.calls[0].arguments;
  assert.ok(callback instanceof URL);
  assert.equal(
    `${callback.origin}${callback.pathname}`,
    authorizationUrl.searchParams.get("redirect_uri"),
  );
  assert.equal(callback.search, currentURL.search);
  assert.deepEqual(checks, {
    expectedState: "state",
    expectedNonce: "nonce",
    idTokenExpected: true,
  });
  assert.equal(currentURL.hostname, "internal.lambda-url.example");
});

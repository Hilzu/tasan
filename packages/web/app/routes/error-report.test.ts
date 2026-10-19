import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { genUserID } from "@tasan/common/id";
import {
  createContext,
  createSession,
  RouterContextProvider,
} from "react-router";

const sessionContext = createContext();
const info = mock.fn();
mock.module("~/.server/auth", {
  namedExports: { sessionContext, sessionMiddleware: () => undefined },
});
mock.module("~/config", {
  namedExports: { originURL: new URL("https://tasan.app") },
});
mock.module("@tasan/common/logging", {
  namedExports: { getLogger: () => ({ info }) },
});
const { action, loader } = await import("./error-report");

const report = {
  description: "I was deleting an expense.",
  error: {
    name: "TypeError",
    message: "Unexpected result",
    stack: "TypeError: Unexpected result\n at deleteExpense (app.js:1:20)",
  },
  route: "routes/split/show-expense",
  version: "abc1234",
};

function args({
  authenticated = true,
  body = JSON.stringify(report),
  origin = "https://tasan.app",
  contentType = "application/json",
  method = "POST",
} = {}) {
  const context = new RouterContextProvider();
  context.set(
    sessionContext,
    createSession(authenticated ? { userID: genUserID() } : {}),
  );
  const request = new Request("https://tasan.app/error-report", {
    method,
    headers: { origin, "content-type": contentType },
    ...(method === "GET" ? {} : { body }),
  });
  return {
    context,
    request,
    params: {},
    url: new URL(request.url),
    pattern: "/error-report",
  };
}

await test("only authenticated users can submit reports", async () => {
  info.mock.resetCalls();
  const response = await action(args({ authenticated: false }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(info.mock.callCount(), 0);
});

await test("session check is private and does not submit a report", async () => {
  info.mock.resetCalls();
  for (const authenticated of [true, false]) {
    const response = loader(args({ authenticated, method: "GET" }));
    assert.deepEqual(await response.json(), { authenticated });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(info.mock.callCount(), 0);
});

await test("valid report is logged with a server-generated reference and only allowed fields", async () => {
  info.mock.resetCalls();
  const response = await action(
    args({
      body: JSON.stringify({ ...report, userID: "forged", cookie: "secret" }),
    }),
  );
  assert.equal(response.status, 201);
  const result: unknown = await response.json();
  assert.ok(
    typeof result === "object" && result !== null && "reportID" in result,
  );
  assert.equal(typeof result.reportID, "string");
  assert.ok(typeof result.reportID === "string");
  assert.match(result.reportID, /^[0-9a-f-]{36}$/);
  assert.equal(info.mock.callCount(), 1);
  assert.deepEqual(info.mock.calls[0]?.arguments, [
    "User submitted error report",
    {
      event: "frontend_error_report",
      reportID: result.reportID,
      report,
    },
  ]);
});

for (const [name, options, status] of [
  ["cross-origin submission", { origin: "https://evil.example" }, 403],
  ["missing origin", { origin: "" }, 403],
  ["non-JSON request", { contentType: "text/plain" }, 415],
  ["malformed JSON", { body: "{" }, 400],
  ["invalid report", { body: "{}" }, 400],
  [
    "oversized description",
    { body: JSON.stringify({ ...report, description: "x".repeat(2001) }) },
    400,
  ],
  ["oversized body without Content-Length", { body: "x".repeat(32769) }, 413],
  ["unsupported method", { method: "DELETE" }, 405],
] as const) {
  await test(`rejects ${name} without logging a report`, async () => {
    info.mock.resetCalls();
    assert.equal((await action(args(options))).status, status);
    assert.equal(info.mock.callCount(), 0);
  });
}

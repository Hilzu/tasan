import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";

import type { renderToPipeableStream } from "react-dom/server";
import { createStaticHandler, type EntryContext } from "react-router";

let renderMode: "complete" | "open" | "error" = "complete";
const renderError = new Error("render failed");
const abort = mock.fn<() => void>();
const render = mock.fn<typeof renderToPipeableStream>((_element, options) => {
  const mode = renderMode;
  queueMicrotask(() => {
    if (mode === "error") options?.onShellError?.(renderError);
    else if (options?.onShellReady) options.onShellReady();
    else options?.onAllReady?.();
  });
  return {
    abort,
    pipe<T extends NodeJS.WritableStream>(destination: T): T {
      destination.write("<html>rendered</html>");
      if (mode === "complete") destination.end();
      return destination;
    },
  };
});

const rendererMock = { renderToPipeableStream: render };
mock.module("react-dom/server", {
  cache: true,
  exports: { default: rendererMock, ...rendererMock },
});
// Prime the CommonJS mock before the server entry imports its named export.
createRequire(import.meta.url)("react-dom/server");
const { default: handleRequest, streamTimeout } =
  await import("~/entry.server");

const staticContext = await createStaticHandler([
  { id: "root", path: "/" },
]).query(new Request("https://tasan.app/"));
assert.ok(!(staticContext instanceof Response));
const routerContext: EntryContext = {
  manifest: {
    entry: { imports: [], module: "/entry.js" },
    routes: {},
    url: "/manifest",
    version: "test",
  },
  routeModules: {},
  future: {},
  ssr: true,
  isSpaMode: false,
  routeDiscovery: { mode: "initial", manifestPath: "/manifest" },
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Required by EntryContext.
  branches: [],
  staticHandlerContext: staticContext,
};

beforeEach(() => {
  renderMode = "complete";
  render.mock.resetCalls();
  abort.mock.resetCalls();
});

await test("HEAD retains document headers without rendering a body", async () => {
  const response = await handleRequest(
    new Request("https://tasan.app/", { method: "HEAD" }),
    200,
    new Headers({ "x-example": "value" }),
    routerContext,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, max-age=0",
  );
  assert.match(response.headers.get("content-security-policy") ?? "", /nonce-/);
  assert.equal(response.headers.get("x-example"), "value");
  assert.equal(render.mock.callCount(), 0);
});

await test("completed renders clear the abort timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const response = await handleRequest(
    new Request("https://tasan.app/"),
    200,
    new Headers(),
    routerContext,
  );
  assert.equal(await response.text(), "<html>rendered</html>");
  t.mock.timers.tick(streamTimeout + 1000);
  assert.equal(abort.mock.callCount(), 0);
});

await test("bots wait for all content and the response uses the renderer nonce", async () => {
  const response = await handleRequest(
    new Request("https://tasan.app/", {
      headers: { "user-agent": "Googlebot/2.1" },
    }),
    200,
    new Headers(),
    routerContext,
  );
  const options = render.mock.calls[0].arguments[1];
  assert.equal(typeof options?.onAllReady, "function");
  assert.equal(options?.onShellReady, undefined);
  const nonce = options?.nonce;
  assert.ok(typeof nonce === "string");
  assert.ok(
    response.headers
      .get("content-security-policy")
      ?.includes(`'nonce-${nonce}'`),
  );
  assert.equal(await response.text(), "<html>rendered</html>");
});

await test("unfinished renders are aborted after the timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  renderMode = "open";
  const response = await handleRequest(
    new Request("https://tasan.app/"),
    200,
    new Headers(),
    routerContext,
  );
  t.mock.timers.tick(streamTimeout + 1000);
  assert.equal(abort.mock.callCount(), 1);
  await response.body?.cancel();
});

await test("cancelled and failed renders clear the abort timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  renderMode = "open";
  const response = await handleRequest(
    new Request("https://tasan.app/"),
    200,
    new Headers(),
    routerContext,
  );
  await response.body?.cancel();
  await setImmediate();
  t.mock.timers.tick(streamTimeout + 1000);
  assert.equal(abort.mock.callCount(), 0);

  renderMode = "error";
  await assert.rejects(
    async () =>
      handleRequest(
        new Request("https://tasan.app/"),
        200,
        new Headers(),
        routerContext,
      ),
    renderError,
  );
  t.mock.timers.tick(streamTimeout + 1000);
  assert.equal(abort.mock.callCount(), 0);
});

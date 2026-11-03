import assert from "node:assert/strict";
import { test } from "node:test";

import * as Rate from "@tasan/common/exchange-rate";
import * as M from "@tasan/common/money";
import {
  createRequestHandler,
  type ServerBuild,
  UNSAFE_decodeViaTurboStream,
} from "react-router";

await test("React Router preserves Money, rates, and Maps in document hydration, loaders, and actions", async () => {
  const original = {
    amount: M.create("9007199254740993.01", "EUR"),
    participants: new Map([["participant", M.create("-0.03", "EUR")]]),
    conversionRate: Rate.create("0.12345678901234567890123456789012345678"),
  };
  const build: ServerBuild = {
    entry: {
      module: {
        default: (_request, status, headers, context) =>
          new Response(context.serverHandoffStream, { status, headers }),
      },
    },
    routes: {
      root: {
        id: "root",
        path: "/",
        module: {
          default: () => null,
          loader: () => original,
          action: () => original,
        },
      },
    },
    assets: {
      version: "test",
      url: "/manifest.js",
      entry: { module: "/entry.js", imports: [] },
      routes: {},
    },
    publicPath: "/",
    assetsBuildDirectory: "build/client",
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
  };
  const handler = createRequestHandler(build, "test");
  for (const [path, method, expected] of [
    [
      "/",
      "GET",
      { loaderData: { root: original }, actionData: null, errors: null },
    ],
    ["/_.data", "GET", { root: { data: original } }],
    ["/_.data", "POST", { data: original }],
  ] as const) {
    const response = await handler(
      new Request(`http://localhost${path}`, { method }),
    );
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const decoded = await UNSAFE_decodeViaTurboStream(
      response.body,
      globalThis,
    );
    assert.deepEqual(decoded.value, expected);
  }
});

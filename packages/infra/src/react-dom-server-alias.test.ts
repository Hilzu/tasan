import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { build } from "esbuild";

import { projectRoot, reactDomServerAlias } from "./react-dom-server-alias.js";

const bundleRenderer = (contents: string) =>
  build({
    absWorkingDir: projectRoot,
    stdin: {
      contents,
      resolveDir: join(projectRoot, "packages/web"),
    },
    alias: { "react-dom/server": reactDomServerAlias() },
    bundle: true,
    platform: "node",
    format: "esm",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    metafile: true,
    write: false,
    logLevel: "silent",
    logOverride: { "import-is-undefined": "error" },
  });

await test("the Lambda alias includes only React's Node streaming renderer", async () => {
  const result = await bundleRenderer(
    'export { renderToPipeableStream } from "react-dom/server";',
  );
  assert.ok(result.metafile);
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(
    inputs.some((path) => path.endsWith("react-dom-server.node.production.js")),
  );
  assert.ok(!inputs.some((path) => path.includes("react-dom-server-legacy")));
});

await test("the Lambda alias rejects unsupported server renderer imports", async () => {
  await assert.rejects(
    bundleRenderer('export { renderToString } from "react-dom/server";'),
    /No matching export/,
  );
  await assert.rejects(
    bundleRenderer(
      'import * as server from "react-dom/server"; server.renderToString;',
    ),
    /will always be undefined/,
  );
});

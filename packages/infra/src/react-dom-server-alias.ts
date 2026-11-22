import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function reactDomServerAliases() {
  const webRequire = createRequire(import.meta.resolve("@tasan/web"));
  const publicRenderer = webRequire.resolve("react-dom/server");
  const reactDomDir = dirname(webRequire.resolve("react-dom/package.json"));
  const streamingRenderer = join(
    reactDomDir,
    "cjs/react-dom-server.node.production.js",
  );
  const rendererPath = relative(projectRoot, streamingRenderer);
  if (
    isAbsolute(rendererPath) ||
    rendererPath === ".." ||
    rendererPath.startsWith(`..${sep}`)
  ) {
    throw new Error(
      "React DOM's streaming renderer is outside the project root",
    );
  }

  // Isolate NODE_ENV so the check cannot alter the CDK process's module cache.
  try {
    execFileSync(
      process.execPath,
      [
        "-e",
        `
          const publicRenderer = require(process.argv[1]);
          const streamingRenderer = require(process.argv[2]);
          if (
            typeof streamingRenderer.renderToPipeableStream !== "function" ||
            publicRenderer.renderToPipeableStream !== streamingRenderer.renderToPipeableStream
          ) {
            throw new Error("React DOM's public and internal Node renderers differ");
          }
        `,
        publicRenderer,
        streamingRenderer,
      ],
      { env: { ...process.env, NODE_ENV: "production" } },
    );
  } catch (error) {
    throw new Error("Cannot safely alias React DOM's Node renderer", {
      cause: error,
    });
  }

  return {
    "react-dom/server": "./packages/infra/bundling/react-dom-server.mjs",
    "react-dom-streaming-renderer": `./${rendererPath.split(sep).join("/")}`,
  };
}

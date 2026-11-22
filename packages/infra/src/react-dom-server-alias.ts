import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function reactDomServerAlias() {
  const facade = "./packages/infra/bundling/react-dom-server.mjs";
  const webRequire = createRequire(import.meta.resolve("@tasan/web"));
  const publicRenderer = webRequire.resolve("react-dom/server");
  const facadeUrl = pathToFileURL(resolve(projectRoot, facade)).href;

  // Isolate NODE_ENV so the check cannot alter the CDK process's module cache.
  try {
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          import { createRequire } from "node:module";
          const publicRenderer = createRequire(import.meta.url)(process.argv[1]);
          const streamingRenderer = await import(process.argv[2]);
          if (
            typeof streamingRenderer.renderToPipeableStream !== "function" ||
            publicRenderer.renderToPipeableStream !== streamingRenderer.renderToPipeableStream
          ) {
            throw new Error("React DOM's public and internal Node renderers differ");
          }
        `,
        publicRenderer,
        facadeUrl,
      ],
      { env: { ...process.env, NODE_ENV: "production" } },
    );
  } catch (error) {
    throw new Error("Cannot safely alias React DOM's Node renderer", {
      cause: error,
    });
  }

  return facade;
}

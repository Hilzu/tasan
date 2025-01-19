import crypto from "node:crypto";
import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";

import { NonceContext } from "~/nonce-context";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const scriptNonce = crypto.randomBytes(16).toString("base64url");

    responseHeaders.set(
      "Content-Security-Policy",
      [
        `script-src 'unsafe-inline' https: 'nonce-${scriptNonce}' 'strict-dynamic'`,
        "object-src 'none'",
        "img-src 'self' data:",
        "default-src 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join("; "),
    );

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ?
        "onAllReady"
      : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <NonceContext.Provider value={scriptNonce}>
        <ServerRouter
          context={routerContext}
          url={request.url}
          nonce={scriptNonce}
        />
      </NonceContext.Provider>,
      {
        nonce: scriptNonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    // Abort the rendering stream after the `streamTimeout` so it has tine to
    // flush down the rejected boundaries
    setTimeout(abort, streamTimeout + 1000);
  });
}

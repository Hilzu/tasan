import crypto from "node:crypto";
import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { logError } from "@tasan/common/logging";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext, HandleErrorFunction } from "react-router";
import { ServerRouter } from "react-router";

import { NonceContext, TimeZoneContext } from "~/context";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
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
  responseHeaders.set("cache-control", "private, no-cache, max-age=0");

  if (request.method.toUpperCase() === "HEAD") {
    responseHeaders.set("Content-Type", "text/html");
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const timeZone =
      request.headers.get("cloudfront-viewer-time-zone") ?? undefined;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const renderState = { complete: false };
    const clearRenderTimeout = () => {
      renderState.complete = true;
      clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ?
        "onAllReady"
      : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <NonceContext.Provider value={scriptNonce}>
        <TimeZoneContext.Provider value={timeZone}>
          <ServerRouter
            context={routerContext}
            url={request.url}
            nonce={scriptNonce}
          />
        </TimeZoneContext.Provider>
      </NonceContext.Provider>,
      {
        nonce: scriptNonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          body.once("finish", clearRenderTimeout);
          body.once("close", clearRenderTimeout);
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          clearRenderTimeout();
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            logError("Streaming render failed", error);
          }
        },
      },
    );

    // Allow rejected boundaries time to flush before aborting the render.
    if (!renderState.complete)
      timeoutId = setTimeout(abort, streamTimeout + 1000);
  });
}

export const handleError: HandleErrorFunction = (error, { request }) => {
  if (!request.signal.aborted) logError("Request failed", error);
};

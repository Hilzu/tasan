import { randomUUID } from "node:crypto";

import { getLogger, logError, withLogContext } from "@tasan/common/logging";
import type { MiddlewareFunction } from "react-router";

export const requestLogging: MiddlewareFunction<Response> = (
  { request },
  next,
) => {
  // Query strings may contain OAuth codes; invitation URLs contain bearer credentials.
  const path = new URL(request.url).pathname.replace(
    /(\/accept-invite\/)[^/]+/,
    "$1[redacted]",
  );
  return withLogContext(
    {
      requestId:
        getLogger().getPersistentLogAttributes().requestId ?? randomUUID(),
      method: request.method,
      path,
      // Vite injects env; the Node test runner does not.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      version: import.meta.env?.VITE_APP_VERSION || "local",
    },
    async () => {
      const start = performance.now();
      getLogger().info("Request received");
      try {
        const response = await next();
        getLogger().info("Request completed", {
          status: response.status,
          durationMs: Math.round(performance.now() - start),
        });
        return response;
      } catch (error) {
        logError("Request failed", error);
        throw error;
      }
    },
  );
};

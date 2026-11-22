import { randomUUID } from "node:crypto";

import { getLogger } from "@tasan/common/logging";
import * as z from "zod";

import { sessionContext, sessionMiddleware } from "~/.server/auth";
import { originURL } from "~/config";

import type { Route } from "./+types/error-report";

const errorReportSchema = z.object({
  description: z.string().trim().max(2000),
  error: z.object({
    name: z.string().max(200),
    message: z.string().max(2000),
    stack: z.string().max(12000),
  }),
  route: z.string().max(200),
  version: z.string().max(100),
});

export const middleware: Route.MiddlewareFunction[] = [sessionMiddleware];

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function loader({ context }: Route.LoaderArgs) {
  return new Response(null, {
    status: context.get(sessionContext).get("userID") ? 204 : 401,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function action({ context, request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  if (!context.get(sessionContext).get("userID")) {
    return json({ error: "Sign in to send an error report." }, 401);
  }
  if (request.headers.get("origin") !== originURL.origin) {
    return json({ error: "Invalid request origin." }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return json({ error: "Expected JSON." }, 415);
  }

  // Enforce the limit while reading; Content-Length may be absent or untrusted.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing report." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        return json({ error: "Report is too large." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const parsed = errorReportSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid error report." }, 400);

  const reportID = randomUUID();
  // User-submitted diagnostic data is kept separate from server exceptions.
  getLogger().info("User submitted error report", {
    event: "frontend_error_report",
    reportID,
    report: parsed.data,
  });
  return json({ reportID }, 201);
}

import { isRouteErrorResponse } from "react-router";
import { z } from "zod";

export const errorReportSchema = z.object({
  description: z.string().trim().max(2000),
  error: z.object({
    name: z.string().max(200),
    message: z.string().max(2000),
    stack: z.string().max(12000),
  }),
  route: z.string().max(200),
  version: z.string().max(100),
});

export type ErrorReport = z.infer<typeof errorReportSchema>;

// Stack URLs can contain OAuth codes, invitation tokens, or development queries.
const cleanStack = (stack: string) =>
  stack.replace(/https?:\/\/[^\s)]+/g, (value) => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname.replace(/(\/accept-invite\/)[^/]+/, "$1[redacted]")}`;
    } catch {
      return "[URL removed]";
    }
  });

export function errorDetails(error: unknown): ErrorReport["error"] {
  if (isRouteErrorResponse(error)) {
    return {
      name: `HTTP ${String(error.status)}`,
      message: error.statusText || "The request could not be completed.",
      stack: "",
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name.slice(0, 200),
      message: error.message.slice(0, 2000),
      stack: cleanStack(error.stack ?? "").slice(0, 12000),
    };
  }
  // Don't stringify arbitrary thrown values, which may include application data.
  return { name: "Error", message: "An unexpected error occurred.", stack: "" };
}

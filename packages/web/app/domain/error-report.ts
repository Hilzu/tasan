import { isRouteErrorResponse } from "react-router";

export interface ErrorDetails {
  name: string;
  message: string;
  stack: string;
}

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

export function errorDetails(error: unknown): ErrorDetails {
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

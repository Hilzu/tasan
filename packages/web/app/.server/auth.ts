import type { UserID } from "@tasan/common/id";
import { getLogger, logError } from "@tasan/common/logging";
import {
  createContext,
  href,
  type MiddlewareFunction,
  redirect,
} from "react-router";

import { getSession, refreshSessionCookie } from "~/.server/sessions";

export const sessionContext =
  createContext<Awaited<ReturnType<typeof getSession>>>();
export const authenticatedSessionContext = createContext<{ userID: UserID }>();

export const sessionMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const session = await getSession(request.headers.get("cookie"));
  context.set(sessionContext, session);
  const userID = session.get("userID");
  if (userID) getLogger().appendKeys({ userId: userID });
  const response = await next();
  // Login and logout own their cookie. Never overwrite them during renewal.
  if (
    !response.headers
      .getSetCookie()
      .some((value) => value.startsWith("__session="))
  ) {
    let cookie: string | undefined;
    try {
      cookie = await refreshSessionCookie(session);
    } catch (error) {
      // The action may already have committed changes; preserve its response.
      logError("Session renewal failed", error);
    }
    if (cookie) {
      response.headers.append("Set-Cookie", cookie);
      response.headers.set("Cache-Control", "private, no-store");
    }
  }
  return response;
};

export const requireAuthentication: MiddlewareFunction<Response> = ({
  context,
  url,
}) => {
  const userID = context.get(sessionContext).get("userID");
  if (!userID) {
    const redirectParam = encodeURIComponent(`${url.pathname}${url.search}`);
    throw redirect(`${href("/login")}?redirect=${redirectParam}`);
  }
  context.set(authenticatedSessionContext, { userID });
};

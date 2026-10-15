import type { UserID } from "@tasan/common/id";
import { getLogger } from "@tasan/common/logging";
import {
  createContext,
  href,
  type MiddlewareFunction,
  redirect,
} from "react-router";

import { getSession } from "~/.server/sessions";

export const sessionContext =
  createContext<Awaited<ReturnType<typeof getSession>>>();
export const authenticatedSessionContext = createContext<{ userID: UserID }>();

export const sessionMiddleware: MiddlewareFunction<Response> = async ({
  request,
  context,
}) => {
  const session = await getSession(request.headers.get("cookie"));
  context.set(sessionContext, session);
  const userID = session.get("userID");
  if (userID) getLogger().appendKeys({ userId: userID });
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

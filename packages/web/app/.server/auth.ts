import { getLogger } from "@tasan/common/logging";
import { getUser } from "@tasan/data";
import { href, redirect } from "react-router";

import { getSession } from "~/.server/sessions";

export const getSessionOrRedirect = async (request: Request, url: URL) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");

  if (!userID) {
    const redirectParam = encodeURIComponent(`${url.pathname}${url.search}`);
    return redirect(`${href("/login")}?redirect=${redirectParam}`);
  }

  getLogger().appendKeys({ userId: userID });
  return { userID };
};

export const getUserOrRedirect = async (request: Request, url: URL) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");
  const redirectParam = encodeURIComponent(`${url.pathname}${url.search}`);

  if (!userID) return redirect(`${href("/login")}?redirect=${redirectParam}`);

  const user = await getUser(userID);
  if (!user) return redirect(`${href("/login")}?redirect=${redirectParam}`);

  getLogger().appendKeys({ userId: userID });
  return user;
};

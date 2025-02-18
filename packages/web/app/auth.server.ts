import { getUser } from "@tasan/data";
import { redirect } from "react-router";

import { getSession } from "~/sessions.server";

export const getSessionOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");
  const currentURL = new URL(request.url);
  const redirectParam = encodeURIComponent(
    `${currentURL.pathname}${currentURL.search}`,
  );

  if (!userID) return redirect(`/log-in?redirect=${redirectParam}`);

  return { userID };
};

export const getUserOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");
  const currentURL = new URL(request.url);
  const redirectParam = encodeURIComponent(
    `${currentURL.pathname}${currentURL.search}`,
  );

  if (!userID) return redirect(`/log-in?redirect=${redirectParam}`);

  const user = await getUser(userID);
  if (!user) return redirect(`/log-in?redirect=${redirectParam}`);

  return user;
};

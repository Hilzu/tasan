import { getUser } from "@tasan/data";
import { href, redirect } from "react-router";

import { getSession } from "~/.server/sessions";

export const getSessionOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");

  if (!userID) {
    const currentURL = new URL(request.url);
    const redirectParam = encodeURIComponent(
      `${currentURL.pathname}${currentURL.search}`,
    );
    return redirect(`${href("/login")}?redirect=${redirectParam}`);
  }

  return { userID };
};

export const getUserOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");
  const currentURL = new URL(request.url);
  const redirectParam = encodeURIComponent(
    `${currentURL.pathname}${currentURL.search}`,
  );

  if (!userID) return redirect(`${href("/login")}?redirect=${redirectParam}`);

  const user = await getUser(userID);
  if (!user) return redirect(`${href("/login")}?redirect=${redirectParam}`);

  return user;
};

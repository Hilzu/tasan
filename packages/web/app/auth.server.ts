import { findUser } from "@tasan/data";
import { redirect } from "react-router";

import { getSession } from "~/sessions.server";

// TODO: session and user in app load context?
export const getUserOrRedirect = async (request: Request) => {
  const session = await getSession(request.headers.get("cookie"));
  const userId = session.get("userId");
  const currentURL = new URL(request.url);
  const redirectParam = encodeURIComponent(
    `${currentURL.pathname}${currentURL.search}`,
  );

  if (!userId) return redirect(`/log-in?redirect=${redirectParam}`);

  const user = await findUser(userId);
  if (!user) return redirect(`/log-in?redirect=${redirectParam}`);

  return user;
};

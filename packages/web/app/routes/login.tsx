import { redirect } from "react-router";

import { buildAuthorizationURL } from "~/.server/openid";
import { commitSession, getSession } from "~/.server/sessions";

import type { Route } from "./+types/login";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  if (session.get("userID")) return redirect("/");

  const url = new URL(request.url);
  const authRedirect = url.searchParams.get("redirect");
  if (authRedirect) session.set("authRedirect", authRedirect);

  const { authorizationUrl, state, nonce } = buildAuthorizationURL();
  session.set("authState", state);
  session.set("authNonce", nonce);

  return redirect(authorizationUrl.href, {
    headers: { "set-cookie": await commitSession(session) },
  });
}

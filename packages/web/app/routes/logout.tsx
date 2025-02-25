import { redirect } from "react-router";

import { buildLogoutURL } from "~/openid.server";
import { destroySession, getSession } from "~/sessions.server";

import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  return redirect(buildLogoutURL().href, {
    headers: { "set-cookie": await destroySession(session) },
  });
}

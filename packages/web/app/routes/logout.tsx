import { getLogger } from "@tasan/common/logging";
import { redirect } from "react-router";

import { buildLogoutURL } from "~/.server/openid";
import { destroySession, getSession } from "~/.server/sessions";

import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const cookie = await destroySession(session);
  getLogger().info("Logout completed", {
    action: "auth.logout",
    outcome: "success",
    userId: session.get("userID"),
  });
  return redirect(buildLogoutURL().href, {
    headers: { "set-cookie": cookie },
  });
}

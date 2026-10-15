import { getLogger } from "@tasan/common/logging";
import { redirect } from "react-router";

import { sessionContext } from "~/.server/auth";
import { buildLogoutURL } from "~/.server/openid";
import { destroySession } from "~/.server/sessions";

import type { Route } from "./+types/logout";

export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext);
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

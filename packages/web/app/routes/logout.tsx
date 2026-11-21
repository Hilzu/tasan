import { getLogger } from "@tasan/common/logging";
import { redirect } from "react-router";

import { sessionContext } from "~/.server/auth";
import { buildLogoutURL } from "~/.server/openid";
import { destroySession } from "~/.server/sessions";
import { originURL } from "~/config";

import type { Route } from "./+types/logout";

export function loader() {
  throw new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function action({ context, request }: Route.ActionArgs) {
  if (request.headers.get("origin") !== originURL.origin)
    throw new Response("Forbidden", { status: 403 });

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

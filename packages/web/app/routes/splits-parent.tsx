import { findUser } from "@tasan/data";
import { Outlet, redirect } from "react-router";

import { getSession } from "~/sessions.server";

import type { Route } from "./+types/splits-parent";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const userId = session.get("userId");
  const currentURL = new URL(request.url);
  const redirectParam = encodeURIComponent(
    `${currentURL.pathname}${currentURL.search}`,
  );

  if (!userId) return redirect(`/login?redirect=${redirectParam}`);

  const user = await findUser(userId);
  if (!user) return redirect(`/login?redirect=${redirectParam}`);

  return { user };
}

export default function SplitsParent(_: Route.ComponentProps) {
  return <Outlet />;
}

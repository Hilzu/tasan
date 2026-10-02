import { Outlet } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";

import type { Route } from "./+types/splits-parent";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Splits - Tasan.app" }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request, url);
  if (session instanceof Response) return session;
  return { session };
}

export default function SplitsParent(_: Route.ComponentProps) {
  return <Outlet />;
}

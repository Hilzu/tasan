import { Outlet } from "react-router";

import { getUserOrRedirect } from "~/auth.server";

import type { Route } from "./+types/parent";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Splits - Tasan.app" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  if (user instanceof Response) return user;
  return { user };
}

export default function SplitsParent(_: Route.ComponentProps) {
  return <Outlet />;
}

import { Outlet } from "react-router";

import {
  authenticatedSessionContext,
  requireAuthentication,
} from "~/.server/auth";

import type { Route } from "./+types/splits-parent";

export const middleware: Route.MiddlewareFunction[] = [requireAuthentication];

export function meta(_: Route.MetaArgs) {
  return [{ title: "Splits - Tasan.app" }];
}

export function loader({ context }: Route.LoaderArgs) {
  const session = context.get(authenticatedSessionContext);
  return { session };
}

export default function SplitsParent(_: Route.ComponentProps) {
  return <Outlet />;
}

import { findUsersSplits, getUsers } from "@tasan/data";
import { data, Outlet } from "react-router";

import { getSessionOrRedirect } from "~/auth.server";

import type { Route } from "./+types/parent";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { splitID } = params;
  const splits = await findUsersSplits(session.userID);
  const split = splits.find((split) => split.id === splitID);
  if (!split) throw data(null, { status: 404 });

  const users = await getUsers(split.users);
  return { split, users, session };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

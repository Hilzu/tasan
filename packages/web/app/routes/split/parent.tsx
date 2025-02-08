import { findUsersSplits, getUsers } from "@tasan/data";
import { data, Outlet } from "react-router";

import { getUserOrRedirect } from "~/auth.server";

import type { Route } from "./+types/parent";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  if (user instanceof Response) return user;

  const { splitID } = params;
  const splits = await findUsersSplits(user.id);
  const split = splits.find((split) => split.id === splitID);
  if (!split) throw data(null, { status: 404 });

  const users = await getUsers(split.users);
  return { split, users, user };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

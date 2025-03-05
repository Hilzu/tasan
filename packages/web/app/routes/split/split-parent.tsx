import { getSplit, getSplitUser, getUsers } from "@tasan/data";
import { data, Outlet } from "react-router";

import { getSessionOrRedirect } from "~/auth.server";

import type { Route } from "./+types/split-parent";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { splitID } = params;
  const splitUser = await getSplitUser({
    userID: session.userID,
    splitID: splitID,
  });
  if (!splitUser) throw data(null, { status: 404 });

  const split = await getSplit(splitID);
  if (!split) throw new Error("Split not found");
  const users = await getUsers(split.userIDs);
  return { split, users, session };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

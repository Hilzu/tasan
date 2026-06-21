import { asSplitID } from "@tasan/common/id";
import { getSplitUser, getSplitWithData, getUsers } from "@tasan/data";
import { data, Outlet } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";

import type { Route } from "./+types/split-parent";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitID = asSplitID(params.splitID);
  const splitUser = await getSplitUser(session.userID, splitID);
  if (!splitUser) throw data(null, { status: 404 });

  const split = await getSplitWithData(splitID);
  if (!split) throw new Error("Split not found");
  const users = await getUsers(split.userIDs);
  return { split, users, session };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

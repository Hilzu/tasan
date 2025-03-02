import { findUserSplitIDs, getSplit, getUsers } from "@tasan/data";
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
  const splitIDs = await findUserSplitIDs(session.userID);
  const foundID = splitIDs.find((id) => id === splitID);
  if (!foundID) throw data(null, { status: 404 });

  const split = await getSplit(splitID);
  if (!split) throw new Error("Split not found");
  const users = await getUsers(split.userIDs);
  return { split, users, session };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

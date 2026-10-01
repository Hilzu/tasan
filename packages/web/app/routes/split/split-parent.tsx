import { asSplitID } from "@tasan/common/id";
import { Outlet } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { errorResponse } from "~/.server/services/http";
import { getSplit } from "~/.server/services/splits";

import type { Route } from "./+types/split-parent";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitID = asSplitID(params.splitID);
  try {
    const { split, users } = await getSplit(session.userID, splitID);
    return { split, users, session };
  } catch (error) {
    throw errorResponse(error);
  }
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

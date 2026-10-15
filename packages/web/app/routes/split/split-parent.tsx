import { asSplitID } from "@tasan/common/id";
import { Outlet } from "react-router";

import { authenticatedSessionContext } from "~/.server/auth";
import { errorResponse } from "~/.server/services/http";
import { getSplit } from "~/.server/services/splits";

import type { Route } from "./+types/split-parent";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.split.name} split - Tasan.app` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = context.get(authenticatedSessionContext);

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

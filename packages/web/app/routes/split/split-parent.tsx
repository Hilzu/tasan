import { asSplitID } from "@tasan/common/id";
import { Outlet } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { application } from "~/.server/services";
import { runApplication } from "~/.server/services/http";

import type { Route } from "./+types/split-parent";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.split.name} split - Tasan.app` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitID = asSplitID(params.splitID);
  const { split, users } = await runApplication(() =>
    application.getSplit(session.userID, splitID),
  );
  return { split, users, session };
}

export type SplitLoader = typeof loader;

export default function SplitParent() {
  return <Outlet />;
}

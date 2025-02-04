import { findUsersSplits } from "@tasan/data";
import { data } from "react-router";

import { getUserOrRedirect } from "~/auth.server";
import { MainHeading } from "~/components/heading";

import type { Route } from "./+types/show";

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
  return { split };
}

export default function ShowSplit({ loaderData }: Route.ComponentProps) {
  const { split } = loaderData;
  return (
    <div>
      <MainHeading>Split - {split.name}</MainHeading>
      <p>{split.description}</p>
    </div>
  );
}

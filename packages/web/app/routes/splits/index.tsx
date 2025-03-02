import { findUsersSplits } from "@tasan/data";
import { href } from "react-router";

import { getSessionOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/index";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your splits - Tasan.app" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splits = await findUsersSplits(session.userID);
  return { splits };
}

export default function SplitsIndex({ loaderData }: Route.ComponentProps) {
  const { splits } = loaderData;
  return (
    <div>
      <div className="flex justify-between">
        <MainHeading>Your splits</MainHeading>
        <Link to={href("/splits/new")} variant="plain">
          <Button>Create</Button>
        </Link>
      </div>

      {splits.length === 0 ?
        <p>You don't have any splits yet.</p>
      : <p>
          You have {splits.length} split{splits.length > 1 ? "s" : ""}.
        </p>
      }

      <ul className="ml-4 mt-2 list-disc">
        {splits.map((split) => (
          <li key={split.id}>
            <Link to={href("/splits/:splitID", { splitID: split.id })}>
              {split.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

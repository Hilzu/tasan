import { href } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { listSplits } from "~/.server/services/splits";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/list-splits";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your splits - Tasan.app" }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request, url);
  if (session instanceof Response) return session;

  const splits = await listSplits(session.userID);
  return { splits };
}

export default function SplitsList({ loaderData }: Route.ComponentProps) {
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

      <ul className="mt-2 ml-4 list-disc">
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

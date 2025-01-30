import { findUsersSplits } from "@tasan/data";

import { getUserOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";
import { Link } from "~/components/link";

import type { Route } from "./+types/index";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your splits - Tasan.app" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userOrRedirect = await getUserOrRedirect(request);
  if (userOrRedirect instanceof Response) return userOrRedirect;

  const splits = await findUsersSplits(userOrRedirect.id);
  return { splits };
}

export default function SplitsIndex({ loaderData }: Route.ComponentProps) {
  const { splits } = loaderData;
  console.log("splits", splits);
  return (
    <div>
      <div className="flex justify-between">
        <MainHeading>Your splits</MainHeading>
        <Link to="/splits/new" variant="plain">
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
            <Link to={`/splits/${split.id}`}>{split.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

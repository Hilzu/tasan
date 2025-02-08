import { useRouteLoaderData } from "react-router";

import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";
import type { SplitLoader } from "~/routes/split/parent";

import type { Route } from "./+types/show";

export default function ShowSplit(_: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, user } = parentData;
  return (
    <div>
      <MainHeading>Split - {split.name}</MainHeading>
      <p className="mb-2">{split.description}</p>
      <Card
        heading={<SubHeading>Participants</SubHeading>}
        action={
          <Link to={`/splits/${split.id}/invite`} variant="plain">
            <Button>Invite</Button>
          </Link>
        }
      >
        <ul>
          {users.map((u) => {
            const isYou = user.id === u.id;
            return (
              <li key={u.id}>
                {u.name} {isYou ? " (you!)" : ""}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

import { examples } from "~/marketing/example-splits";
import { LandingPage } from "~/marketing/landing-page";

import type { Route } from "./+types/index";

export function loader({ request }: Route.LoaderArgs) {
  const requestedExample = new URL(request.url).searchParams.get("example");
  const selectedExample =
    examples.find(({ id }) => id === requestedExample) ?? examples[0];

  return { selectedExampleId: selectedExample.id };
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tasan — Good times. All square." },
    {
      name: "description",
      content:
        "Split bills across currencies, evenly or by shares, with automatic conversion and simplified repayments. Tasan brings shared expenses into one home currency and works out who pays whom.",
    },
  ];
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return <LandingPage selectedExampleId={loaderData.selectedExampleId} />;
}

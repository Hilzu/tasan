import { redirect } from "react-router";

import { getSession } from "~/sessions.server";

import type { Route } from "./+types/split-index";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  if (!session.has("id")) {
    const currentURL = new URL(request.url);
    const redirectParam = encodeURIComponent(
      `${currentURL.pathname}${currentURL.search}`,
    );
    return redirect(`/sign-up?redirect=${redirectParam}`);
  }
  return { name: session.get("name") };
}

export default function SplitIndex({ loaderData }: Route.ComponentProps) {
  const { name } = loaderData;
  return <div>Hello user {name}!</div>;
}

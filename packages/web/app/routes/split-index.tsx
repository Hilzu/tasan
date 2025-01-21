import { redirect } from "react-router";

import { Link } from "~/components/link";
import { getSession } from "~/sessions.server";

import type { Route } from "./+types/split-index";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  if (!session.has("userId")) {
    const currentURL = new URL(request.url);
    const redirectParam = encodeURIComponent(
      `${currentURL.pathname}${currentURL.search}`,
    );
    return redirect(`/sign-up?redirect=${redirectParam}`);
  }
  return { name: session.get("userId") };
}

export default function SplitIndex({ loaderData }: Route.ComponentProps) {
  const { name } = loaderData;
  return (
    <main className="container p-4">
      <div>Hello user {name}!</div>
      <div>
        <Link to="/logout">Logout</Link>
      </div>
    </main>
  );
}

import { getUser } from "@tasan/data";
import { Outlet } from "react-router";

import { Footer } from "~/components/footer";
import { Header } from "~/components/header";
import { getSession } from "~/sessions.server";

import type { Route } from "./+types/layout";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tasan.app - Split bills with your friends" },
    {
      name: "description",
      content: "Easily split bills with your friends using the Tasan web app.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const userID = session.get("userID");
  const user = userID ? await getUser(userID) : undefined;
  return { user };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <main className="container mb-16 mt-4">
        <Outlet />
      </main>
      <Footer className="mt-auto" />
    </div>
  );
}

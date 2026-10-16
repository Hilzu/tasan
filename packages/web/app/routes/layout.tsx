import { getUser } from "@tasan/data";
import { Outlet, useRouteLoaderData } from "react-router";

import { sessionContext, sessionMiddleware } from "~/.server/auth";
import { Footer } from "~/components/footer";
import { Header } from "~/components/header";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [sessionMiddleware];

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tasan.app - Split bills with your friends" },
    {
      name: "description",
      content: "Easily split bills with your friends using the Tasan web app.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext);
  const userID = session.get("userID");
  const user = userID ? await getUser(userID) : undefined;
  return { user };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const splitData = useRouteLoaderData<SplitLoader>("split-parent");
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} split={splitData?.split} />
      <main className="container mt-4 mb-16">
        <Outlet />
      </main>
      <Footer className="mt-auto" />
    </div>
  );
}

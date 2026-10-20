import { getUser } from "@tasan/data";
import { href, Outlet, useRouteLoaderData } from "react-router";

import { sessionContext, sessionMiddleware } from "~/.server/auth";
import { getLocale } from "~/.server/locale";
import { localeOption } from "~/.server/locales";
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

export async function loader({ context, request, url }: Route.LoaderArgs) {
  const session = context.get(sessionContext);
  const userID = session.get("userID");
  // Settings must read back the latest preference after a save. Other pages
  // keep their existing eventual-read behavior.
  const user =
    userID ?
      await getUser(userID, {
        consistentRead: url.pathname === href("/settings"),
      })
    : undefined;
  return {
    user,
    locale: getLocale(request, user?.locale),
    localeOption:
      url.pathname === href("/settings") && user?.locale ?
        localeOption(user.locale)
      : undefined,
  };
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
      <Footer className="mt-auto" showSettings={Boolean(user)} />
    </div>
  );
}

import { LandingPage } from "~/marketing/landing-page";

import type { Route } from "./+types/index";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tasan.app - Split bills with your friends" },
    {
      name: "description",
      content: "Easily split bills with your friends using the Tasan web app.",
    },
  ];
}

export default function Index() {
  return <LandingPage />;
}

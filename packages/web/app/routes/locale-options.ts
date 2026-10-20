import { data } from "react-router";

import { searchLocales } from "~/.server/locales";

import type { Route } from "./+types/locale-options";

// Locale names are public data; suggestions need no session or profile read.
export function loader({ url }: Route.LoaderArgs) {
  return data(searchLocales(url.searchParams.get("q") ?? ""), {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}

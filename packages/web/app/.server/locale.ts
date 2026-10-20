import { createCookie } from "react-router";

import { parseAcceptLanguage } from "~/.server/accept-language";
import { canonicalLocale } from "~/domain/locale";

// A formatting preference contains no sensitive data and needs no session lookup.
export const localeCookie = createCookie("locale", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
});

export async function getLocale(request: Request) {
  const preference = canonicalLocale(
    await localeCookie.parse(request.headers.get("cookie")),
  );
  const browserLocale =
    canonicalLocale(
      parseAcceptLanguage(request.headers.get("accept-language")),
    ) ?? "en-US";
  return { locale: preference ?? browserLocale, preference: preference ?? "" };
}

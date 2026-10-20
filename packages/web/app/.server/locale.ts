import { parseAcceptLanguage } from "~/.server/accept-language";
import { canonicalLocale } from "~/domain/locale";

export function getLocale(request: Request, preference?: string) {
  return (
    canonicalLocale(preference) ??
    canonicalLocale(
      parseAcceptLanguage(request.headers.get("accept-language")),
    ) ??
    "en-US"
  );
}

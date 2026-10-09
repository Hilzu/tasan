export function parseAcceptLanguage(header: string | null): string | undefined {
  const language = header?.split(",")[0].split(";")[0].trim();
  if (!language || language === "*") return undefined;

  try {
    return Intl.getCanonicalLocales(language)[0];
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

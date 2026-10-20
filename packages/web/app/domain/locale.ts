export const localeOptions = [
  ["en-US", "English (United States)"],
  ["en-GB", "English (United Kingdom)"],
  ["fi-FI", "Finnish (Finland)"],
  ["sv-SE", "Swedish (Sweden)"],
  ["sv-FI", "Swedish (Finland)"],
  ["da-DK", "Danish (Denmark)"],
  ["nb-NO", "Norwegian (Norway)"],
  ["de-DE", "German (Germany)"],
  ["fr-FR", "French (France)"],
  ["es-ES", "Spanish (Spain)"],
  ["it-IT", "Italian (Italy)"],
  ["nl-NL", "Dutch (Netherlands)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["ja-JP", "Japanese (Japan)"],
  ["ko-KR", "Korean (South Korea)"],
  ["zh-CN", "Chinese (China)"],
  ["zh-TW", "Chinese (Taiwan)"],
] as const;

export function canonicalLocale(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > 100)
    return undefined;
  try {
    const locale = Intl.getCanonicalLocales(value)[0];
    return (
        locale &&
          Intl.DateTimeFormat.supportedLocalesOf(locale).length &&
          Intl.NumberFormat.supportedLocalesOf(locale).length
      ) ?
        locale
      : undefined;
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

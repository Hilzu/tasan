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

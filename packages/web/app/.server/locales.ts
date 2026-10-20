import catalog from "cldr-core/availableLocales.json";

import { canonicalLocale } from "~/domain/locale";

// Intl cannot enumerate locales. Use Unicode's full catalog, then filter it
// through both formatters in this runtime. Only this small JSON file is loaded.
const { availableLocales } = catalog;
const englishNames = new Intl.DisplayNames(["en"], {
  type: "language",
  languageDisplay: "standard",
});

export function localeOption(value: string) {
  const locale = canonicalLocale(value);
  if (!locale) return undefined;
  const baseName = new Intl.Locale(locale).baseName;
  const englishName = englishNames.of(baseName) ?? baseName;
  const english =
    locale === baseName ? englishName : `${englishName} (${locale})`;
  const native = new Intl.DisplayNames([locale], {
    type: "language",
    languageDisplay: "standard",
  }).of(baseName);
  return {
    value: locale,
    label: native && native !== english ? `${english} — ${native}` : english,
  };
}

const values = new Set(
  availableLocales.full.flatMap((value) => {
    const locale = new Intl.Locale(value);
    // CLDR omits redundant default regions (e.g. fi-FI and ja-JP). Include them
    // explicitly so users can select familiar language/country combinations.
    const region = locale.maximize().region;
    return !locale.region && region ? [value, `${value}-${region}`] : [value];
  }),
);
const collator = new Intl.Collator("en");
export const localeOptions = [...values]
  .flatMap((value) => {
    const option = localeOption(value);
    return option ? [option] : [];
  })
  .filter(
    (option, index, options) =>
      options.findIndex(({ value }) => value === option.value) === index,
  )
  .sort((a, b) => collator.compare(a.label, b.label));

export function resolveLocaleOption(value: FormDataEntryValue | null) {
  if (value === "" || value === "Browser default") return "";
  if (typeof value !== "string") return undefined;
  // Names are a convenience for the picker, not an allowlist. Also accept any
  // supported BCP 47 tag, including extensions and locales outside the catalog.
  return (
    localeOptions.find(({ label }) => label === value)?.value ??
    canonicalLocale(value)
  );
}

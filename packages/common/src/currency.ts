import * as Rate from "./exchange-rate.js";

// Fetched from https://api.frankfurter.dev/v1/currencies, plus historic
// currencies that existing splits and expenses may still use.
export const currencies = {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  __proto__: null!,
  AUD: { name: "Australian Dollar", fractions: 2 },
  BGN: { name: "Bulgarian Lev", fractions: 2 },
  BRL: { name: "Brazilian Real", fractions: 2 },
  CAD: { name: "Canadian Dollar", fractions: 2 },
  CHF: { name: "Swiss Franc", fractions: 2 },
  CNY: { name: "Chinese Renminbi Yuan", fractions: 2 },
  CZK: { name: "Czech Koruna", fractions: 2 },
  DKK: { name: "Danish Krone", fractions: 2 },
  EUR: { name: "Euro", fractions: 2 },
  GBP: { name: "British Pound", fractions: 2 },
  HKD: { name: "Hong Kong Dollar", fractions: 2 },
  HUF: { name: "Hungarian Forint", fractions: 2 },
  IDR: { name: "Indonesian Rupiah", fractions: 2 },
  ILS: { name: "Israeli New Shekel", fractions: 2 },
  INR: { name: "Indian Rupee", fractions: 2 },
  ISK: { name: "Icelandic Króna", fractions: 0 },
  JPY: { name: "Japanese Yen", fractions: 0 },
  KRW: { name: "South Korean Won", fractions: 0 },
  MXN: { name: "Mexican Peso", fractions: 2 },
  MYR: { name: "Malaysian Ringgit", fractions: 2 },
  NOK: { name: "Norwegian Krone", fractions: 2 },
  NZD: { name: "New Zealand Dollar", fractions: 2 },
  PHP: { name: "Philippine Peso", fractions: 2 },
  PLN: { name: "Polish Złoty", fractions: 2 },
  RON: { name: "Romanian Leu", fractions: 2 },
  SEK: { name: "Swedish Krona", fractions: 2 },
  SGD: { name: "Singapore Dollar", fractions: 2 },
  THB: { name: "Thai Baht", fractions: 2 },
  TRY: { name: "Turkish Lira", fractions: 2 },
  USD: { name: "United States Dollar", fractions: 2 },
  ZAR: { name: "South African Rand", fractions: 2 },
} as const;

type PropertyValues<Obj> = Obj[Exclude<keyof Obj, "__proto__">];

export type CurrencySymbol = keyof typeof currencies;

export type CurrencyInfo = PropertyValues<typeof currencies>;

export const currencySymbols = Object.keys(currencies);

/** Units per euro for currencies replaced by the euro at an irrevocably fixed
 * rate. The exchange-rate provider no longer serves them, so conversions go
 * through the euro using these rates. Bulgaria adopted the euro on 2026-01-01.
 */
export const fixedEuroRates: Partial<
  Record<CurrencySymbol, Rate.ExchangeRate>
> = {
  BGN: Rate.create("1.95583"),
};

/** Historic currencies stay readable and convertible for existing data, but
 * are offered for new splits and expenses only where already in use.
 */
export const isHistoricCurrency = (symbol: CurrencySymbol) =>
  Object.hasOwn(fixedEuroRates, symbol);

export const isCurrencySelectable = (
  symbol: CurrencySymbol,
  inUse: readonly (CurrencySymbol | undefined)[] = [],
) => !isHistoricCurrency(symbol) || inUse.includes(symbol);

export const selectableCurrencies = (
  inUse: readonly (CurrencySymbol | undefined)[] = [],
) =>
  (Object.keys(currencies) as CurrencySymbol[])
    .filter((symbol) => isCurrencySelectable(symbol, inUse))
    .map((symbol) => ({ symbol, name: currencies[symbol].name }));

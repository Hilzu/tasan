import { z } from "zod";

import { type CurrencySymbol, fixedEuroRates } from "./currency.js";
import * as Rate from "./exchange-rate.js";
import { getLogger } from "./logging.js";
import { captureAsync } from "./tracing.js";
import { currencySymbolSchema } from "./validation.js";

const convertResponseSchema = z.looseObject({
  base: currencySymbolSchema,
  rates: z.record(
    currencySymbolSchema,
    z.number().transform((value, ctx) => {
      try {
        return Rate.create(String(value));
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid exchange rate" });
        return z.NEVER;
      }
    }),
  ),
});

const cacheTTL = 60 * 60 * 1000;
const rates = new Map<string, { rate: Rate.ExchangeRate; expiresAt: number }>();
const pendingRates = new Map<string, Promise<Rate.ExchangeRate>>();

export const fetchCurrencyConversionRate = async (
  from: CurrencySymbol,
  to: CurrencySymbol,
): Promise<Rate.ExchangeRate> => {
  if (fixedEuroRates[from] === undefined && fixedEuroRates[to] === undefined)
    return fetchCachedRate(from, to);
  // The provider no longer publishes rates for fixed-rate currencies, so
  // derive their pairs through the euro. The shortest decimal text of the
  // quotient is exactly what a JS number holds, as Rate.create requires.
  const [fromRate, toRate] = await Promise.all([
    unitsPerEuro(from),
    unitsPerEuro(to),
  ]);
  return Rate.create(String(toRate / fromRate));
};

const unitsPerEuro = async (symbol: CurrencySymbol): Promise<number> =>
  fixedEuroRates[symbol] ??
  (symbol === "EUR" ? 1 : Number(await fetchCachedRate("EUR", symbol)));

const fetchCachedRate = async (
  from: CurrencySymbol,
  to: CurrencySymbol,
): Promise<Rate.ExchangeRate> => {
  const key = `${from}:${to}`;
  const cached = rates.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;
  const pending = pendingRates.get(key);
  if (pending) return pending;

  const promise = fetchRate(from, to);
  pendingRates.set(key, promise);
  try {
    const rate = await promise;
    rates.set(key, { rate, expiresAt: Date.now() + cacheTTL });
    return rate;
  } finally {
    pendingRates.delete(key);
  }
};

const fetchRate = captureAsync(
  "fetchCurrencyConversionRate",
  async (
    from: CurrencySymbol,
    to: CurrencySymbol,
  ): Promise<Rate.ExchangeRate> => {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`,
    );
    if (!res.ok) {
      throw new Error(
        `Exchange rate provider returned HTTP ${String(res.status)}`,
        {
          cause: { from, to, status: res.status },
        },
      );
    }
    const data = convertResponseSchema.parse(await res.json());
    const rate = data.rates[to];
    if (!rate) throw new Error(`No exchange rate for ${to}`);
    getLogger().info("Exchange rate fetched", { from, to, rate });
    return rate;
  },
);

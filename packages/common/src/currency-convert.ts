import { z } from "zod";

import type { CurrencySymbol } from "./currency.js";
import { getLogger } from "./logging.js";
import { captureAsync } from "./tracing.js";
import { currencySymbolSchema } from "./validation.js";

const convertResponseSchema = z.looseObject({
  base: currencySymbolSchema,
  rates: z.record(currencySymbolSchema, z.number().positive()),
});

const cacheTTL = 60 * 60 * 1000;
const rates = new Map<string, { rate: number; expiresAt: number }>();
const pendingRates = new Map<string, Promise<number>>();

export const fetchCurrencyConversionRate = async (
  from: CurrencySymbol,
  to: CurrencySymbol,
): Promise<number> => {
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
  async (from: CurrencySymbol, to: CurrencySymbol): Promise<number> => {
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

import { z } from "zod";

import type { CurrencySymbol } from "./currency.js";
import { getLogger } from "./logging.js";
import { captureAsync } from "./tracing.js";
import { currencySymbolSchema } from "./validation.js";

const convertResponseSchema = z.looseObject({
  base: currencySymbolSchema,
  rates: z.record(currencySymbolSchema, z.number().positive()),
});

export const fetchCurrencyConversionRate = captureAsync(
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

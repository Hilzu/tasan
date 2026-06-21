import { z } from "zod";

import type { CurrencySymbol } from "./currency.js";
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
      const body = await res.text();
      console.error(
        `Failed to fetch exchange rate: ${res.statusText}\n${body}`,
      );
      throw new Error("Failed to fetch exchange rate");
    }
    const data = convertResponseSchema.parse(await res.json());
    console.log("Got exchange rate data", data);
    const rate = data.rates[to];
    if (!rate) throw new Error(`No exchange rate for ${to}`);
    return rate;
  },
);

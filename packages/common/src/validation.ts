import { z } from "zod";

import { currencies, type CurrencySymbol } from "./currency.js";
import * as Decimal from "./decimal.js";

export const currencySymbolSchema = z
  .string()
  .refine(
    (c): c is CurrencySymbol => c in currencies,
    "Invalid currency symbol",
  );

export const currencySchema = z
  .number()
  .positive()
  .finite()
  .transform((c) => Decimal.create(c));

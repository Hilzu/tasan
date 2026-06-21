import { type RefinementCtx, z } from "zod";

import { currencies, type CurrencySymbol } from "./currency.js";
import * as Decimal from "./decimal.js";
import { asCognitoUserID, asUserID } from "./id.js";

export const currencySymbolSchema = z
  .string()
  .refine(
    (c): c is CurrencySymbol => c in currencies,
    "Invalid currency symbol",
  );

export const decimalSchema = z
  .number()
  .positive()
  .transform((c) => Decimal.create(c));

const validateID =
  <T>(validateFN: (id: string) => T) =>
  (id: string, ctx: RefinementCtx): T => {
    try {
      return validateFN(id);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid ID",
        params: { id },
      });
      return z.NEVER;
    }
  };

export const cognitoIDSchema = z
  .string()
  .transform(validateID(asCognitoUserID));

export const userIDSchema = z.string().transform(validateID(asUserID));

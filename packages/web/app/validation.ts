import { data } from "react-router";
import { type inferFlattenedErrors, z } from "zod";

import { currencies, type CurrencySymbol } from "~/currencies";

export function validateOrRespond<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
) {
  const result = schema.safeParse(formData);
  if (result.success) return { data: result.data as z.infer<T> };
  const errors = result.error.flatten() as inferFlattenedErrors<typeof schema>;
  return { response: data({ errors }, { status: 400 }) };
}

export const currencySymbolSchema = z
  .string()
  .refine(
    (c): c is CurrencySymbol => c in currencies,
    "Invalid currency symbol",
  );

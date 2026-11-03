import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as M from "@tasan/common/money";

import { ApplicationError } from "./errors";

export const invalidField = (field: string, message: string): never => {
  throw new ApplicationError("invalid_input", message, { [field]: [message] });
};

export const validateName = (name: string) => {
  if (name.length < 1 || name.length > 64)
    invalidField("name", "Name must contain between 1 and 64 characters.");
};

export const validateCurrency = (currency: CurrencySymbol) => {
  if (!Object.hasOwn(currencies, currency))
    invalidField("currency", "Invalid currency symbol.");
};

export const toAmount = (
  value: string,
  currency: CurrencySymbol,
  field: string,
) => {
  try {
    const amount = M.create(value, currency);
    if (M.gt(amount, 0)) return amount;
  } catch {
    /* Report domain validation as a field error. */
  }
  return invalidField(
    field,
    `Amount must be positive, within the supported range, and use ${String(currencies[currency].fractions)} decimal places at most.`,
  );
};

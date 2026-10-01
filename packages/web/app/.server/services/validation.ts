import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";

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
  value: number,
  currency: CurrencySymbol,
  field: string,
) => {
  const amount = D.create(value, currencies[currency].fractions);
  if (!Number.isFinite(value) || value <= 0 || !D.equals(amount, value))
    invalidField(
      field,
      `Amount must be positive and use ${String(currencies[currency].fractions)} decimal places at most.`,
    );
  return amount;
};

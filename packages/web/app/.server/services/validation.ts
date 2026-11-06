import {
  currencies,
  type CurrencySymbol,
  isCurrencySelectable,
} from "@tasan/common/currency";
import * as M from "@tasan/common/money";

import { amountLimitError } from "~/domain/expense-limits";

import { ApplicationError } from "./errors";

export const invalidField = (field: string, message: string): never => {
  throw new ApplicationError("invalid_input", message, { [field]: [message] });
};

export const validateName = (name: string) => {
  if (name.length < 1 || name.length > 64)
    invalidField("name", "Name must contain between 1 and 64 characters.");
};

/** `inUse` lists currencies the split or expense already uses, which remain
 * allowed even when historic.
 */
export const validateCurrency = (
  currency: CurrencySymbol,
  inUse: readonly CurrencySymbol[] = [],
) => {
  if (!Object.hasOwn(currencies, currency))
    invalidField("currency", "Invalid currency symbol.");
  if (!isCurrencySelectable(currency, inUse))
    invalidField(
      "currency",
      `${currencies[currency].name} is no longer in use. Choose another currency.`,
    );
};

export const toAmount = (
  value: string,
  currency: CurrencySymbol,
  field: string,
) => {
  let amount: M.Money | undefined;
  try {
    amount = M.create(value, currency);
  } catch {
    /* Report domain validation as a field error. */
  }
  if (!amount || !M.gt(amount, 0))
    return invalidField(
      field,
      `Amount must be positive and use ${String(currencies[currency].fractions)} decimal places at most.`,
    );
  const limitError = amountLimitError(amount);
  return limitError ? invalidField(field, limitError) : amount;
};

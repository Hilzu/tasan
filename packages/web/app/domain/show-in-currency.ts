import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";

export const showInCurrency = (
  amount: D.Decimal,
  currency: CurrencySymbol,
  exchangeRate?: number,
) => {
  if (!exchangeRate) return "";
  const fractions = currencies[currency].fractions;
  const str = D.toString(D.mul(D.create(amount, fractions), exchangeRate));
  return `(${currency} ${str})`;
};

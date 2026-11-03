import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import {
  assertCurrency,
  formatDecimal,
  type Money,
  toString,
} from "@tasan/common/money";

export function formatAmount(
  amount: Money,
  currency: CurrencySymbol,
  language?: string,
  signDisplay: Intl.NumberFormatOptions["signDisplay"] = "auto",
): string {
  assertCurrency(amount, currency);
  return formatDecimal(
    toString(amount),
    new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: currencies[amount.currency].fractions,
      maximumFractionDigits: currencies[amount.currency].fractions,
      signDisplay,
    }),
  );
}

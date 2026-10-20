import type { CurrencySymbol } from "@tasan/common/currency";
import type { Decimal } from "@tasan/common/decimal";

export function formatAmount(
  amount: Decimal,
  currency: CurrencySymbol,
  language?: string,
  signDisplay: Intl.NumberFormatOptions["signDisplay"] = "auto",
): string {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: amount.fractions,
    maximumFractionDigits: amount.fractions,
    signDisplay,
  }).format(amount.value);
}

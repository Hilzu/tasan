import { currencies } from "@tasan/common/currency";
import { formatDecimal, type Money, toString } from "@tasan/common/money";

export function formatAmount(
  amount: Money,
  language?: string,
  signDisplay: Intl.NumberFormatOptions["signDisplay"] = "auto",
): string {
  const { fractions } = currencies[amount.currency];
  return formatDecimal(
    toString(amount),
    new Intl.NumberFormat(language, {
      style: "currency",
      currency: amount.currency,
      currencyDisplay: "code",
      minimumFractionDigits: fractions,
      maximumFractionDigits: fractions,
      signDisplay,
    }),
  );
}

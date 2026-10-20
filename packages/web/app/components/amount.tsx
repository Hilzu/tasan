import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";

import { useLanguage } from "~/context";
import { formatAmount } from "~/domain/format-amount";

export function useFormatAmount() {
  const language = useLanguage();
  return (
    amount: D.Decimal,
    currency: CurrencySymbol,
    signDisplay?: Intl.NumberFormatOptions["signDisplay"],
  ) => formatAmount(amount, currency, language, signDisplay);
}

interface AmountRenderProps {
  amount: D.Decimal;
  currency: CurrencySymbol;
  signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

export function AmountRender({
  amount,
  currency,
  signDisplay,
}: AmountRenderProps) {
  const format = useFormatAmount();
  return <span>{format(amount, currency, signDisplay)}</span>;
}

export function ConvertedAmount({
  amount,
  currency,
  exchangeRate,
}: Pick<AmountRenderProps, "amount" | "currency"> & { exchangeRate?: number }) {
  if (!exchangeRate) return null;
  const fractions = currencies[currency].fractions;
  // Convert before rounding so the destination precision never changes the source amount.
  const converted = D.create(amount.value * exchangeRate, fractions);
  return (
    <>
      (<AmountRender amount={converted} currency={currency} />)
    </>
  );
}

import type { CurrencySymbol } from "@tasan/common/currency";
import type * as D from "@tasan/common/decimal";

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
}: Pick<AmountRenderProps, "currency"> & { amount?: D.Decimal }) {
  if (!amount) return null;
  return (
    <>
      (<AmountRender amount={amount} currency={currency} />)
    </>
  );
}

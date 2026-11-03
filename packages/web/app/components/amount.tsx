import type { CurrencySymbol } from "@tasan/common/currency";
import type * as M from "@tasan/common/money";

import { useLanguage } from "~/context";
import { formatAmount } from "~/domain/format-amount";

export function useFormatAmount() {
  const language = useLanguage();
  return (
    amount: M.Money,
    currency: CurrencySymbol,
    signDisplay?: Intl.NumberFormatOptions["signDisplay"],
  ) => formatAmount(amount, currency, language, signDisplay);
}

interface AmountRenderProps {
  amount: M.Money;
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

export function AmountWithConversion({
  amount,
  currency,
  convertedAmount,
  convertedCurrency,
}: Pick<AmountRenderProps, "amount" | "currency"> & {
  convertedAmount?: M.Money;
  convertedCurrency: CurrencySymbol;
}) {
  return (
    <>
      <AmountRender amount={amount} currency={currency} />
      {convertedAmount && (
        <>
          {" "}
          (
          <AmountRender amount={convertedAmount} currency={convertedCurrency} />
          )
        </>
      )}
    </>
  );
}

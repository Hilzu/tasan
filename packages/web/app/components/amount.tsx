import type * as M from "@tasan/common/money";

import { useLanguage } from "~/context";
import { formatAmount } from "~/domain/format-amount";

export function useFormatAmount() {
  const language = useLanguage();
  return (
    amount: M.Money,
    signDisplay?: Intl.NumberFormatOptions["signDisplay"],
  ) => formatAmount(amount, language, signDisplay);
}

interface MoneyRenderProps {
  amount: M.Money;
  signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

export function MoneyRender({ amount, signDisplay }: MoneyRenderProps) {
  const format = useFormatAmount();
  return <span>{format(amount, signDisplay)}</span>;
}

export function AmountWithConversion({
  amount,
  convertedAmount,
}: {
  amount: M.Money;
  convertedAmount?: M.Money;
}) {
  return (
    <>
      <MoneyRender amount={amount} />
      {convertedAmount && (
        <>
          {" "}
          (
          <MoneyRender amount={convertedAmount} />)
        </>
      )}
    </>
  );
}

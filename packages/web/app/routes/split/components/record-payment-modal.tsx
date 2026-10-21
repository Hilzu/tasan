import type { CurrencySymbol } from "@tasan/common/currency";
import type { Decimal } from "@tasan/common/decimal";
import type { ExpenseID, SplitID, UserID } from "@tasan/common/id";
import { useEffect, useState } from "react";
import { href, useFetcher } from "react-router";

import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { FieldError } from "~/components/formField";
import { Modal } from "~/components/modal";
import type { action } from "~/routes/split/record-repayment";

export interface PaymentDraft {
  id: ExpenseID;
  payer: UserID;
  recipient: UserID;
  payerName: string;
  recipientName: string;
  amount: Decimal;
}

export function RecordPaymentModal({
  payment,
  splitID,
  currency,
  onClose,
}: {
  payment: PaymentDraft;
  splitID: SplitID;
  currency: CurrencySymbol;
  onClose: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.state !== "idle";
  const [timedOut, setTimedOut] = useState(false);
  const reset = fetcher.reset;
  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => {
      reset();
      setTimedOut(true);
    }, 15_000);
    return () => {
      clearTimeout(timeout);
    };
  }, [pending, reset]);
  useEffect(() => {
    if (!pending && fetcher.data && "saved" in fetcher.data) onClose();
  }, [pending, fetcher.data, onClose]);
  const error =
    timedOut ? "Saving timed out. You can safely retry."
    : fetcher.data && "error" in fetcher.data ? fetcher.data.error
    : undefined;
  return (
    <Modal
      title="Record payment"
      open
      dismissible={!pending}
      onClose={onClose}
      actions={
        <>
          <Button
            type="submit"
            value="cancel"
            variant="secondary"
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setTimedOut(false);
              void fetcher.submit(
                {
                  id: payment.id,
                  payer: payment.payer,
                  recipient: payment.recipient,
                  amount: payment.amount.value,
                },
                {
                  method: "post",
                  action: href("/splits/:splitID/record-repayment", {
                    splitID,
                  }),
                },
              );
            }}
          >
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <p>
        {payment.payerName} paid {payment.recipientName}{" "}
        <AmountRender amount={payment.amount} currency={currency} />.
      </p>
      <p className="mt-2 text-sm">
        Confirm only after the money has been paid.
      </p>
      {error && (
        <div className="mt-2" role="alert">
          <FieldError errors={[error]} />
        </div>
      )}
    </Modal>
  );
}

import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { SplitID, UserID } from "@tasan/common/id";
import type { SplitExpense, User } from "@tasan/data";
import { href } from "react-router";

import { AmountRender } from "~/components/amount";
import { DateRender } from "~/components/date";
import { Link } from "~/components/link";
import { convertExpense } from "~/domain/convert-expense";

export interface ExpenseListItemProps {
  expense: SplitExpense;
  currency: CurrencySymbol;
  users: User[];
  currentUserID: UserID;
  splitID: SplitID;
}

export default function ExpenseListItem({
  expense,
  currency,
  users,
  currentUserID,
  splitID,
}: ExpenseListItemProps) {
  const yourShare = expense.participants.get(currentUserID) ?? D.create(0);
  const converted =
    expense.conversionRate ? convertExpense(expense, currency) : undefined;
  const convertedShare = converted?.participants.get(currentUserID);
  return (
    <li className="space-y-1 leading-tight">
      <div className="font-semibold">
        <Link
          to={href("/splits/:splitID/:expenseID", {
            splitID,
            expenseID: expense.id,
          })}
        >
          {expense.kind === "repayment" ?
            `${users.find((u) => u.id === expense.payer)?.name ?? "Unknown"} paid ${users.find((u) => expense.participants.has(u.id))?.name ?? "Unknown"}`
          : expense.name}
        </Link>
      </div>
      <div>
        <AmountRender amount={expense.amount} currency={expense.currency} />{" "}
        {converted && (
          <>
            (<AmountRender amount={converted.amount} currency={currency} />)
          </>
        )}
        {expense.kind !== "repayment" && (
          <> paid by {users.find((u) => u.id === expense.payer)?.name}</>
        )}
      </div>
      {expense.kind !== "repayment" && (
        <div>
          {D.equals(yourShare, 0) ?
            "You didn't participate"
          : <>
              Your share is{" "}
              <AmountRender amount={yourShare} currency={expense.currency} />{" "}
              {convertedShare && (
                <>
                  (<AmountRender amount={convertedShare} currency={currency} />)
                </>
              )}
            </>
          }
        </div>
      )}
      <div className="text-xs">
        <DateRender date={expense.createdAt} />
      </div>
    </li>
  );
}

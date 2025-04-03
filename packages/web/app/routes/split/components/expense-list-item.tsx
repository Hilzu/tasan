import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { SplitID, UserID } from "@tasan/common/id";
import type { SplitExpense, User } from "@tasan/data";
import { href } from "react-router";

import { DateRender } from "~/components/date";
import { Link } from "~/components/link";
import { showInCurrency } from "~/domain/show-in-currency";

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
  return (
    <li className="space-y-1 leading-tight">
      <div className="font-semibold">
        <Link
          to={href("/splits/:splitID/:expenseID", {
            splitID,
            expenseID: expense.id,
          })}
        >
          {expense.name}
        </Link>
      </div>
      <div>
        {expense.currency} {D.toString(expense.amount)}{" "}
        {showInCurrency(expense.amount, currency, expense.conversionRate)} paid
        by {users.find((u) => u.id === expense.payer)?.name}
      </div>
      <div>
        {D.equals(yourShare, 0) ?
          "You didn't participate"
        : <>
            Your share is {expense.currency} {D.toString(yourShare)}{" "}
            {showInCurrency(yourShare, currency, expense.conversionRate)}
          </>
        }
      </div>
      <div className="text-xs">
        <DateRender date={expense.createdAt} />
      </div>
    </li>
  );
}

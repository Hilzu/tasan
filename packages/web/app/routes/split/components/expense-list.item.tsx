import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";
import type { SplitExpense, User } from "@tasan/data";

import { showInCurrency } from "~/domain/show-in-currency";

export interface ExpenseListItemProps {
  expense: SplitExpense;
  currency: CurrencySymbol;
  users: User[];
  currentUserID: UserID;
}

export default function ExpenseListItem({
  expense,
  currency,
  users,
  currentUserID,
}: ExpenseListItemProps) {
  const yourShare = expense.participants.get(currentUserID) ?? D.create(0);
  return (
    <li>
      <div>
        {expense.name} - {expense.createdAt.toISOString()}
      </div>
      <div>
        {users.find((u) => u.id === expense.payer)?.name} paid{" "}
        {expense.currency} {D.toString(expense.amount)}{" "}
        {showInCurrency(expense.amount, currency, expense.conversionRate)}
      </div>
      <div>
        {D.equals(yourShare, 0) ?
          "You didn't participate"
        : <>
            Your share: {expense.currency} {D.toString(yourShare)}{" "}
            {showInCurrency(yourShare, currency, expense.conversionRate)}
          </>
        }
      </div>
    </li>
  );
}

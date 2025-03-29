import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";
import type { SplitExpense, User } from "@tasan/data";
import { useContext } from "react";

import { LanguageContext } from "~/context";
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
  const language = useContext(LanguageContext);
  const yourShare = expense.participants.get(currentUserID) ?? D.create(0);
  return (
    <li>
      <div className="font-semibold">{expense.name}</div>
      <div>
        {expense.currency} {D.toString(expense.amount)}{" "}
        {showInCurrency(expense.amount, currency, expense.conversionRate)} paid
        by {users.find((u) => u.id === expense.payer)?.name}
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
      <div className="text-sm">
        {expense.createdAt.toLocaleString(language)}
      </div>
    </li>
  );
}

import type { CurrencySymbol } from "@tasan/common/currency";
import type { UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
import type { SplitExpense } from "@tasan/data";

import { convertExpense } from "~/domain/convert-expense";

export const calculateExpenseSummary = (
  expenses: SplitExpense[],
  currency: CurrencySymbol,
  userID: UserID,
) => {
  let total = M.create("0", currency);
  let paid = M.create("0", currency);
  let share = M.create("0", currency);

  for (const expense of expenses) {
    if (expense.kind === "repayment") continue;
    const { amount, participants } = convertExpense(expense, currency);
    total = M.add(total, amount);
    if (expense.payer === userID) paid = M.add(paid, amount);
    const participation = participants.get(userID);
    if (participation) share = M.add(share, participation);
  }

  return { total, paid, share };
};

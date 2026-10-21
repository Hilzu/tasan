import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";
import type { SplitExpense } from "@tasan/data";

import { convertExpense } from "~/domain/convert-expense";

export const calculateExpenseSummary = (
  expenses: SplitExpense[],
  currency: CurrencySymbol,
  userID: UserID,
) => {
  const fractions = currencies[currency].fractions;
  let total = D.create(0, fractions);
  let paid = D.create(0, fractions);
  let share = D.create(0, fractions);

  for (const expense of expenses) {
    if (expense.kind === "repayment") continue;
    const { amount, participants } = convertExpense(expense, currency);
    total = D.add(total, amount);
    if (expense.payer === userID) paid = D.add(paid, amount);
    const participation = participants.get(userID);
    if (participation) share = D.add(share, participation);
  }

  return { total, paid, share };
};

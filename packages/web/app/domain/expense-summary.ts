import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";
import type { SplitExpense } from "@tasan/data";

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
    // Convert before rounding so foreign fractional amounts survive when the
    // home currency has fewer decimal places (for example EUR to JPY).
    const convert = (amount: D.Decimal) =>
      D.create(amount.value * (expense.conversionRate ?? 1), fractions);
    const amount = convert(expense.amount);
    total = D.add(total, amount);
    if (expense.payer === userID) paid = D.add(paid, amount);
    const participation = expense.participants.get(userID);
    if (participation) share = D.add(share, convert(participation));
  }

  return { total, paid, share };
};

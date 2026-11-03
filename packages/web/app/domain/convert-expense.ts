import type { CurrencySymbol } from "@tasan/common/currency";
import * as Rate from "@tasan/common/exchange-rate";
import * as M from "@tasan/common/money";
import type { SplitExpense } from "@tasan/data";

// Convert decimal amounts and rates exactly, then round the total half up once
// and allocate whole minor units by largest remainder.
// Stable ties favour the payer, then user ID, independent of map insertion order.
export const convertExpense = (
  expense: SplitExpense,
  currency: CurrencySymbol,
) => {
  M.assertCurrency(expense.amount, expense.currency);
  const participants = [...expense.participants]
    .map(([userID, amount], index) => ({ userID, amount, index }))
    .sort(
      (a, b) =>
        Number(b.userID === expense.payer) -
          Number(a.userID === expense.payer) ||
        a.userID.localeCompare(b.userID),
    );
  const converted = M.convertAndAllocate(
    expense.amount,
    participants.map(({ amount }) => amount),
    expense.conversionRate ?? Rate.create("1"),
    currency,
  );
  return {
    amount: converted.total,
    participants: new Map(
      // Allocation priority must not change the participant display order.
      participants
        .map(({ userID, index }, part) => ({
          userID,
          index,
          amount: converted.parts[part],
        }))
        .sort((a, b) => a.index - b.index)
        .map(({ userID, amount }) => [userID, amount]),
    ),
  };
};

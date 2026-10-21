import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { SplitExpense } from "@tasan/data";

// Round the total once, then allocate whole minor units by largest remainder.
// Stable ties favour the payer, then user ID, independent of map insertion order.
export const convertExpense = (
  expense: SplitExpense,
  currency: CurrencySymbol,
) => {
  const fractions = currencies[currency].fractions;
  const scale = 10 ** fractions;
  const rate = expense.conversionRate ?? 1;
  const amount = D.create(expense.amount.value * rate, fractions);
  const shares = [...expense.participants].map(([userID, share]) => {
    const exact = share.value * rate * scale;
    const units = Math.floor(exact);
    return { userID, units, remainder: exact - units };
  });
  const remaining =
    Math.round(amount.value * scale) -
    shares.reduce((sum, share) => sum + share.units, 0);
  const order = [...shares].sort((a, b) => {
    const difference = b.remainder - a.remainder;
    // Ignore floating-point noise when fractional remainders are equal.
    return (
      (Math.abs(difference) > 1e-9 ? difference : 0) ||
      Number(b.userID === expense.payer) - Number(a.userID === expense.payer) ||
      a.userID.localeCompare(b.userID)
    );
  });
  for (const share of order.slice(0, remaining)) share.units++;
  return {
    amount,
    participants: new Map(
      shares.map(({ userID, units }) => [
        userID,
        D.create(units / scale, fractions),
      ]),
    ),
  };
};

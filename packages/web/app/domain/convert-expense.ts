import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { SplitExpense } from "@tasan/data";

// Convert decimal amounts and rates exactly, then round the total half up once
// and allocate whole minor units by largest remainder.
// Stable ties favour the payer, then user ID, independent of map insertion order.
export const convertExpense = (
  expense: SplitExpense,
  currency: CurrencySymbol,
) => {
  const fractions = currencies[currency].fractions;
  const scale = 10 ** fractions;
  const rate = D.toRational(expense.conversionRate ?? 1);
  const convert = (value: D.Decimal) => {
    const source = D.toRational(value);
    const numerator = source.numerator * rate.numerator * BigInt(scale);
    const denominator = source.denominator * rate.denominator;
    return {
      units: numerator / denominator,
      remainder: numerator % denominator,
      denominator,
    };
  };
  const total = convert(expense.amount);
  const totalUnits =
    total.units + (total.remainder * 2n >= total.denominator ? 1n : 0n);
  const amount = D.create(Number(totalUnits) / scale, fractions);
  const shares = [...expense.participants].map(([userID, share]) => {
    return { userID, ...convert(share) };
  });
  const remaining =
    totalUnits - shares.reduce((sum, share) => sum + share.units, 0n);
  const order = [...shares].sort((a, b) => {
    const difference =
      b.remainder * a.denominator - a.remainder * b.denominator;
    return (
      (difference > 0n ? 1
      : difference < 0n ? -1
      : 0) ||
      Number(b.userID === expense.payer) - Number(a.userID === expense.payer) ||
      a.userID.localeCompare(b.userID)
    );
  });
  for (const share of order.slice(0, Number(remaining))) share.units++;
  return {
    amount,
    participants: new Map(
      shares.map(({ userID, units }) => [
        userID,
        D.create(Number(units) / scale, fractions),
      ]),
    ),
  };
};

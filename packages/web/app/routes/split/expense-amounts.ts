import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";

// Undefined means automatic; specific amounts must be positive.
export const calculateExpenseAmounts = (
  total: D.Decimal | undefined,
  inputs: ReadonlyMap<UserID, D.Decimal | undefined>,
  fractions: number,
  payer: UserID,
) => {
  const zero = D.create(0, fractions);
  const participants = new Map(
    [...inputs].map(([id, value]) => [
      id,
      value ? D.create(value, fractions) : zero,
    ]),
  );
  const explicitTotal = [...participants.values()].reduce(
    (sum, value) => D.add(sum, value),
    zero,
  );
  const amount = total ? D.create(total, fractions) : explicitTotal;
  const automatic = [...inputs.keys()].filter(
    (id) => inputs.get(id) === undefined,
  );
  const remaining = D.sub(amount, explicitTotal);
  // Distribute in minor units so amounts never become negative through rounding.
  const units = Math.round(Math.max(0, remaining.value) * 10 ** fractions);
  const perPersonUnits = Math.floor(units / (automatic.length || 1));
  let extraUnits = units - perPersonUnits * automatic.length;
  // Give the payer the first rounding unit when they have an automatic amount.
  const order =
    automatic.includes(payer) ?
      [payer, ...automatic.filter((id) => id !== payer)]
    : automatic;
  for (const id of order) {
    const extra = extraUnits > 0 ? 1 : 0;
    extraUnits -= extra;
    participants.set(
      id,
      D.create((perPersonUnits + extra) / 10 ** fractions, fractions),
    );
  }
  const participantTotal = [...participants.values()].reduce(
    (sum, value) => D.add(sum, value),
    zero,
  );
  const difference = D.sub(amount, participantTotal);
  const invalidAmounts = new Set(
    [...participants].filter(([, value]) => !D.gt(value, 0)).map(([id]) => id),
  );
  return {
    amount,
    participants,
    invalidAmounts,
    difference,
    valid:
      participants.size > 0 &&
      D.gt(amount, 0) &&
      D.equals(difference, 0) &&
      invalidAmounts.size === 0,
    hasAmounts:
      total !== undefined ||
      [...inputs.values()].some((value) => value !== undefined),
  };
};

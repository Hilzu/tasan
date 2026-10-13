import * as D from "@tasan/common/decimal";
import type { UserID } from "@tasan/common/id";

// Undefined means automatic; specific shares must be positive.
export const calculateExpenseAmounts = (
  total: D.Decimal | undefined,
  inputs: ReadonlyMap<UserID, D.Decimal | undefined>,
  fractions: number,
  payer: UserID,
) => {
  const zero = D.create(0, fractions);
  const explicitTotal = [...inputs.values()].reduce<D.Decimal>(
    (sum, value) => D.add(sum, value ? D.create(value, fractions) : zero),
    zero,
  );
  const amount = total ? D.create(total, fractions) : explicitTotal;
  const automatic = [...inputs.keys()].filter(
    (id) => inputs.get(id) === undefined,
  );
  const remaining = D.sub(amount, explicitTotal);
  // Distribute in minor units so shares never become negative through rounding.
  const units = Math.round(Math.max(0, remaining.value) * 10 ** fractions);
  const shareUnits = Math.floor(units / (automatic.length || 1));
  let extraUnits = units - shareUnits * automatic.length;
  const automaticShares = new Map<UserID, D.Decimal>();
  // Give the payer the first rounding unit when they have an automatic share.
  const order =
    automatic.includes(payer) ?
      [payer, ...automatic.filter((id) => id !== payer)]
    : automatic;
  for (const id of order) {
    const extra = extraUnits > 0 ? 1 : 0;
    extraUnits -= extra;
    automaticShares.set(
      id,
      D.create((shareUnits + extra) / 10 ** fractions, fractions),
    );
  }
  const participants = new Map(
    [...inputs].map(([id, value]) => [
      id,
      value ? D.create(value, fractions) : (automaticShares.get(id) ?? zero),
    ]),
  );
  const participantTotal = [...participants.values()].reduce(
    (sum, value) => D.add(sum, value),
    zero,
  );
  return {
    amount,
    participants,
    invalidShares: new Set(
      [...participants]
        .filter(([, value]) => !D.gt(value, 0))
        .map(([id]) => id),
    ),
    difference: D.sub(amount, participantTotal),
    hasAmounts:
      total !== undefined ||
      [...inputs.values()].some((value) => value !== undefined),
  };
};

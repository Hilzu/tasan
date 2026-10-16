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

export interface ShareInput {
  // Undefined means the shares input is invalid.
  shares: number | undefined;
  adjustment: D.Decimal | undefined;
}

// Splits what remains of the total after adjustments in proportion to shares.
// Adjustments may be negative, so someone can pay less than an equal share.
export const calculateShareAmounts = (
  total: D.Decimal | undefined,
  inputs: ReadonlyMap<UserID, ShareInput>,
  fractions: number,
  payer: UserID,
) => {
  const scale = 10 ** fractions;
  const toUnits = (value: D.Decimal | undefined) =>
    value ? Math.round(value.value * scale) : 0;
  const zero = D.create(0, fractions);
  const amount = total ? D.create(total, fractions) : zero;
  const invalidShares = new Set(
    [...inputs]
      .filter(([, { shares }]) => shares === undefined || !(shares >= 0))
      .map(([id]) => id),
  );
  const shares = new Map(
    [...inputs].map(([id, input]) => [
      id,
      invalidShares.has(id) ? 0 : (input.shares ?? 0),
    ]),
  );
  const totalShares = [...shares.values()].reduce((sum, n) => sum + n, 0);
  const adjustmentUnits = [...inputs.values()].reduce(
    (sum, { adjustment }) => sum + toUnits(adjustment),
    0,
  );
  const baseUnits = toUnits(amount) - adjustmentUnits;
  // Largest remainder in minor units keeps the sum exact; the payer wins ties.
  const exact = new Map(
    [...shares].map(([id, n]) => [
      id,
      totalShares > 0 ? (baseUnits * n) / totalShares : 0,
    ]),
  );
  const shareUnits = new Map(
    [...exact].map(([id, value]) => [id, Math.floor(value + 1e-9)]),
  );
  let extraUnits =
    totalShares > 0 ?
      baseUnits - [...shareUnits.values()].reduce((sum, n) => sum + n, 0)
    : 0;
  const ids = [...inputs.keys()];
  const order = [...ids]
    .filter((id) => (shares.get(id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (exact.get(b) ?? 0) -
          (shareUnits.get(b) ?? 0) -
          ((exact.get(a) ?? 0) - (shareUnits.get(a) ?? 0)) ||
        Number(b === payer) - Number(a === payer) ||
        ids.indexOf(a) - ids.indexOf(b),
    );
  for (const id of order) {
    if (extraUnits <= 0) break;
    shareUnits.set(id, (shareUnits.get(id) ?? 0) + 1);
    extraUnits--;
  }
  const participants = new Map(
    [...inputs].map(([id, { adjustment }]) => [
      id,
      D.create(
        ((shareUnits.get(id) ?? 0) + toUnits(adjustment)) / scale,
        fractions,
      ),
    ]),
  );
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
    invalidShares,
    invalidAmounts,
    difference,
    valid:
      total !== undefined &&
      participants.size > 0 &&
      D.gt(amount, 0) &&
      D.equals(difference, 0) &&
      invalidShares.size === 0 &&
      invalidAmounts.size === 0,
  };
};

// Blank shares count as zero; undefined marks unparseable or negative input.
export const parseShares = (text: string) => {
  const shares = Number(text.trim().replace(",", "."));
  return Number.isFinite(shares) && shares >= 0 ? shares : undefined;
};

// Steps from the parsed value, treating invalid input as zero and never going
// below zero; rounding drops float noise such as 1.1000000000000001.
export const stepShares = (text: string, delta: number) =>
  String(Math.max(0, Number(((parseShares(text) ?? 0) + delta).toFixed(6))));

import type { CurrencySymbol } from "@tasan/common/currency";
import type { UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";

const invalidCalculation = (
  currency: CurrencySymbol,
  ids: UserID[],
  total: M.Money | undefined,
) => {
  const zero = M.create("0", currency);
  return {
    amount: total ?? zero,
    participants: new Map(ids.map((id) => [id, zero])),
    invalidAmounts: new Set(ids),
    difference: zero,
    valid: false,
    error:
      "These amounts cannot be allocated within the supported range. Reduce the amounts or change the allocation.",
  };
};

// Undefined means automatic; specific amounts must be positive.
export const calculateExpenseAmounts = (
  total: M.Money | undefined,
  inputs: ReadonlyMap<UserID, M.Money | undefined>,
  currency: CurrencySymbol,
  payer: UserID,
) => {
  try {
    const zero = M.create("0", currency);
    if (total) M.assertCurrency(total, currency);
    const participants = new Map(
      [...inputs].map(([id, value]) => {
        if (value) M.assertCurrency(value, currency);
        return [id, value ?? zero] as const;
      }),
    );
    const explicitTotal = [...participants.values()].reduce(M.add, zero);
    const amount = total ?? explicitTotal;
    const automatic = [...inputs.keys()].filter(
      (id) => inputs.get(id) === undefined,
    );
    const remaining = M.sub(amount, explicitTotal);
    // Preserve the form's payer-then-input-order tie policy.
    const order =
      automatic.includes(payer) ?
        [payer, ...automatic.filter((id) => id !== payer)]
      : automatic;
    const allocated = M.allocate(
      M.gt(remaining, 0) ? remaining : zero,
      order.map(() => "1"),
    );
    order.forEach((id, index) => participants.set(id, allocated[index]));
    const difference = M.sub(
      amount,
      [...participants.values()].reduce(M.add, zero),
    );
    const invalidAmounts = new Set(
      [...participants]
        .filter(([, value]) => !M.gt(value, 0))
        .map(([id]) => id),
    );
    return {
      error: undefined,
      amount,
      participants,
      invalidAmounts,
      difference,
      valid:
        participants.size > 0 &&
        M.gt(amount, 0) &&
        M.equals(difference, 0) &&
        invalidAmounts.size === 0,
      hasAmounts:
        total !== undefined ||
        [...inputs.values()].some((value) => value !== undefined),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      ...invalidCalculation(currency, [...inputs.keys()], total),
      hasAmounts: true,
    };
  }
};

export interface ShareInput {
  shares: string | undefined;
  adjustment: M.Money | undefined;
}

// Apply signed adjustments, then allocate the remainder by exact decimal weights.
export const calculateShareAmounts = (
  total: M.Money | undefined,
  inputs: ReadonlyMap<UserID, ShareInput>,
  currency: CurrencySymbol,
  payer: UserID,
) => {
  try {
    const zero = M.create("0", currency);
    const amount = total ?? zero;
    M.assertCurrency(amount, currency);
    const invalidShares = new Set(
      [...inputs]
        .filter(
          ([, { shares }]) =>
            shares === undefined || parseShares(shares) === undefined,
        )
        .map(([id]) => id),
    );
    const adjustments = new Map(
      [...inputs].map(([id, { adjustment }]) => {
        if (adjustment) M.assertCurrency(adjustment, currency);
        return [id, adjustment ?? zero] as const;
      }),
    );
    const base = M.sub(amount, [...adjustments.values()].reduce(M.add, zero));
    const order = [...inputs.keys()].sort(
      (a, b) => Number(b === payer) - Number(a === payer),
    );
    const allocated = M.allocate(
      base,
      order.map((id) =>
        invalidShares.has(id) ? "0" : (inputs.get(id)?.shares ?? "0"),
      ),
    );
    const shares = new Map(order.map((id, index) => [id, allocated[index]]));
    const participants = new Map(
      [...inputs.keys()].map((id) => [
        id,
        M.add(shares.get(id) ?? zero, adjustments.get(id) ?? zero),
      ]),
    );
    const difference = M.sub(
      amount,
      [...participants.values()].reduce(M.add, zero),
    );
    const invalidAmounts = new Set(
      [...participants]
        .filter(([, value]) => !M.gt(value, 0))
        .map(([id]) => id),
    );
    return {
      error: undefined,
      amount,
      participants,
      invalidShares,
      invalidAmounts,
      difference,
      valid:
        total !== undefined &&
        participants.size > 0 &&
        M.gt(amount, 0) &&
        M.equals(difference, 0) &&
        invalidShares.size === 0 &&
        invalidAmounts.size === 0,
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      ...invalidCalculation(currency, [...inputs.keys()], total),
      invalidShares: new Set<UserID>(),
    };
  }
};

export const parseShares = (text: string): string | undefined => {
  try {
    return M.weight(text);
  } catch {
    return undefined;
  }
};
export const stepShares = (text: string, delta: number): string => {
  const current = parseShares(text) ?? "0";
  try {
    return M.stepWeight(current, delta);
  } catch {
    return current;
  }
};

import type { CurrencySymbol } from "@tasan/common/currency";
import type { UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";

import { amountLimitError } from "~/domain/expense-limits";

const allocationResult = (
  amount: M.Money,
  participants: Map<UserID, M.Money>,
) => {
  const zero = M.create("0", amount.currency);
  const difference = M.sub(
    amount,
    [...participants.values()].reduce(M.add, zero),
  );
  const invalidAmounts = new Set(
    [...participants].filter(([, value]) => !M.gt(value, 0)).map(([id]) => id),
  );
  // Reported on the total, separately from allocation problems.
  const limitError = amountLimitError(amount);
  return {
    limitError,
    amount,
    participants,
    invalidAmounts,
    difference,
    valid:
      participants.size > 0 &&
      M.gt(amount, 0) &&
      M.equals(difference, 0) &&
      invalidAmounts.size === 0 &&
      limitError === undefined,
  };
};

// Undefined means automatic; specific amounts must be positive.
export const calculateExpenseAmounts = (
  total: M.Money | undefined,
  inputs: ReadonlyMap<UserID, M.Money | undefined>,
  currency: CurrencySymbol,
  payer: UserID,
) => {
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
  if (order.length > 0) {
    const allocated = M.allocate(
      M.gt(remaining, 0) ? remaining : zero,
      order.map(() => "1"),
    );
    order.forEach((id, index) => participants.set(id, allocated[index]));
  }
  return {
    ...allocationResult(amount, participants),
    hasAmounts:
      total !== undefined ||
      [...inputs.values()].some((value) => value !== undefined),
  };
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
  const weights = order.map((id) =>
    invalidShares.has(id) ? "0" : (
      (parseShares(inputs.get(id)?.shares ?? "0") ?? "0")
    ),
  );
  // Without shares nothing is allocated; the difference reports the remainder.
  const allocated =
    weights.every((weight) => weight === "0") ?
      weights.map(() => zero)
    : M.allocate(base, weights);
  const shares = new Map(order.map((id, index) => [id, allocated[index]]));
  const participants = new Map(
    [...inputs.keys()].map((id) => [
      id,
      M.add(shares.get(id) ?? zero, adjustments.get(id) ?? zero),
    ]),
  );
  const result = allocationResult(amount, participants);
  return {
    ...result,
    invalidShares,
    valid: total !== undefined && result.valid && invalidShares.size === 0,
  };
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

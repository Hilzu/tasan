import * as M from "@tasan/common/money";

// Every amount entered, recorded, or converted for a split stays within one
// trillion units. This keeps stored amounts within 15 significant digits.
export const amountLimitError = (
  amount: M.Money,
  { converted = false } = {},
): string | undefined => {
  const limit = M.create("1000000000000", amount.currency);
  return M.gt(amount, limit) || M.gt(M.negate(amount), limit) ?
      `${converted ? "Converted amount" : "Amount"} must not exceed 1 trillion ${amount.currency}.`
    : undefined;
};

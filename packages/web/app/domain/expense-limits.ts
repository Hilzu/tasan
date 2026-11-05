import * as M from "@tasan/common/money";

// Apply this limit to new spending in both the source and split currencies.
// Repayments may cover multiple expenses; stored historical amounts stay readable.
export const expenseAmountLimitError = (amount: M.Money): string | undefined =>
  M.gt(amount, M.create("1000000000000", amount.currency)) ?
    `Expense amount must not exceed 1 trillion ${amount.currency}.`
  : undefined;

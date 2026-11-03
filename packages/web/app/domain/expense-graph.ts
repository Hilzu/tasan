import type { CurrencySymbol } from "@tasan/common/currency";
import * as G from "@tasan/common/graph";
import type { UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
import type { SplitExpense, SplitWithData } from "@tasan/data";

import { convertExpense } from "~/domain/convert-expense";

export const createGraphWithCurrency = (
  currency: CurrencySymbol,
  expenses: SplitExpense[],
) => {
  let graph = G.create();
  for (const expense of expenses) {
    const { payer } = expense;
    for (const [userID, amount] of convertExpense(expense, currency)
      .participants) {
      if (userID === payer || !M.gt(amount, 0)) continue;
      graph = G.upsertEdge(graph, userID, payer, amount);
    }
  }

  return graph;
};

export const calculateExpenseGraph = (split: SplitWithData) => {
  return simplifyDebts(
    createGraphWithCurrency(split.currency, split.expenses),
    split.currency,
  );
};

export interface Balance {
  userID: UserID;
  balance: M.Money;
}

/**
 * Net balance per user: positive when others owe the user, negative when
 * the user owes others. Sorted so the user most in the red comes first.
 */
export const calculateBalances = (
  graph: G.Graph,
  userIDs: UserID[],
  currency: CurrencySymbol,
): Balance[] => {
  const zero = M.create("0", currency);
  const balances = new Map<UserID, M.Money>(userIDs.map((id) => [id, zero]));
  for (const [from, edges] of graph) {
    for (const { to, amount } of edges) {
      balances.set(from, M.sub(balances.get(from) ?? zero, amount));
      balances.set(to, M.add(balances.get(to) ?? zero, amount));
    }
  }
  return [...balances]
    .map(([userID, balance]) => ({ userID, balance }))
    .sort(
      (a, b) =>
        M.compare(a.balance, b.balance) || a.userID.localeCompare(b.userID),
    );
};

/**
 * Repeatedly match the largest remaining debtor and creditor. This preserves
 * net balances while allowing payments between people without a direct debt.
 * Each payment settles at least one person, giving at most n - 1 payments,
 * though the greedy approach does not guarantee the minimum payment count.
 */
export const simplifyDebts = (
  graph: G.Graph,
  currency: CurrencySymbol,
): G.Graph => {
  const balances = calculateBalances(graph, [], currency);
  const debtors = balances
    .filter(({ balance }) => balance.minorUnits < 0n)
    .map(({ userID, balance }) => ({ userID, balance: M.negate(balance) }));
  const creditors = balances.filter(({ balance }) => M.gt(balance, 0));
  const largestFirst = (a: Balance, b: Balance) =>
    M.compare(b.balance, a.balance) || a.userID.localeCompare(b.userID);
  let repayments = G.create();

  while (true) {
    const debtor = debtors.sort(largestFirst).at(0);
    const creditor = creditors.sort(largestFirst).at(0);
    if (!debtor || !creditor) break;
    if (!M.gt(debtor.balance, 0) || !M.gt(creditor.balance, 0)) break;

    const amount =
      M.gt(debtor.balance, creditor.balance) ?
        creditor.balance
      : debtor.balance;
    repayments = G.upsertEdge(
      repayments,
      debtor.userID,
      creditor.userID,
      amount,
    );
    debtor.balance = M.sub(debtor.balance, amount);
    creditor.balance = M.sub(creditor.balance, amount);
  }

  return repayments;
};

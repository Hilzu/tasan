import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import * as G from "@tasan/common/graph";
import type { UserID } from "@tasan/common/id";
import type { SplitExpense, SplitWithData } from "@tasan/data";

export const createGraphWithCurrency = (
  currency: CurrencySymbol,
  expenses: SplitExpense[],
) => {
  let graph = G.create();
  const fractions = currencies[currency].fractions;

  for (const expense of expenses) {
    const { payer, conversionRate } = expense;
    for (const [userID, amountValue] of expense.participants) {
      if (userID === payer) continue;
      // Preserve source fractions until after conversion (for example EUR cents
      // converted to whole JPY), matching the expense summary calculation.
      const amount = D.create(
        amountValue.value * (conversionRate ?? 1),
        fractions,
      );
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
  balance: D.Decimal;
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
  const zero = D.create(0, currencies[currency].fractions);
  const balances = new Map<UserID, D.Decimal>(userIDs.map((id) => [id, zero]));
  for (const [from, edges] of graph) {
    for (const { to, amount } of edges) {
      balances.set(from, D.sub(balances.get(from) ?? zero, amount));
      balances.set(to, D.add(balances.get(to) ?? zero, amount));
    }
  }
  return [...balances]
    .map(([userID, balance]) => ({ userID, balance }))
    .sort(
      (a, b) =>
        a.balance.value - b.balance.value || a.userID.localeCompare(b.userID),
    );
};

/**
 * First settle debtors and creditors whose balances match exactly, then
 * repeatedly match the largest remaining debtor and creditor. This preserves
 * net balances while allowing payments between people without a direct debt.
 * Each payment settles at least one person, giving at most n - 1 payments,
 * though the greedy approach does not guarantee the minimum payment count.
 * The exact-match pass catches pairs the greedy can split up, for example
 * debts of 7 and 6 against credits of 6, 4, and 3.
 */
export const simplifyDebts = (
  graph: G.Graph,
  currency: CurrencySymbol,
): G.Graph => {
  const balances = calculateBalances(graph, [], currency);
  const debtors = balances
    .filter(({ balance }) => balance.value < 0)
    .map(({ userID, balance }) => ({ userID, balance: D.mul(balance, -1) }));
  const creditors = balances.filter(({ balance }) => D.gt(balance, 0));
  const largestFirst = (a: Balance, b: Balance) =>
    b.balance.value - a.balance.value || a.userID.localeCompare(b.userID);
  let repayments = G.create();

  for (const debtor of debtors.sort(largestFirst)) {
    const creditor = creditors
      .sort(largestFirst)
      .find(({ balance }) => D.equals(balance, debtor.balance));
    if (!creditor) continue;
    repayments = G.upsertEdge(
      repayments,
      debtor.userID,
      creditor.userID,
      debtor.balance,
    );
    creditor.balance = D.sub(creditor.balance, debtor.balance);
    debtor.balance = D.sub(debtor.balance, debtor.balance);
  }

  while (true) {
    const debtor = debtors.sort(largestFirst).at(0);
    const creditor = creditors.sort(largestFirst).at(0);
    if (!debtor || !creditor) break;
    if (!D.gt(debtor.balance, 0) || !D.gt(creditor.balance, 0)) break;

    const amount =
      D.gt(debtor.balance, creditor.balance) ?
        creditor.balance
      : debtor.balance;
    repayments = G.upsertEdge(
      repayments,
      debtor.userID,
      creditor.userID,
      amount,
    );
    debtor.balance = D.sub(debtor.balance, amount);
    creditor.balance = D.sub(creditor.balance, amount);
  }

  return repayments;
};

import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import * as G from "@tasan/common/graph";
import type { SplitExpense, SplitWithData } from "@tasan/data";

export const cancelMutual = (graph: G.Graph): G.Graph => {
  let newGraph = G.create();
  const skipEdgeMap = new WeakMap<G.Edge, boolean>();

  for (const [from, edges] of graph) {
    for (const edge of edges) {
      if (skipEdgeMap.get(edge)) continue;
      const { to, amount } = edge;
      const reverseEdge = (graph.get(to) ?? []).find((e) => e.to === from);
      if (!reverseEdge) {
        newGraph = G.upsertEdge(newGraph, from, to, amount);
        continue;
      }

      const reverseAmount = reverseEdge.amount;
      skipEdgeMap.set(reverseEdge, true);
      if (D.gt(amount, reverseAmount)) {
        const newAmount = D.sub(amount, reverseAmount);
        newGraph = G.upsertEdge(newGraph, from, to, newAmount);
      } else if (D.gt(reverseAmount, amount)) {
        const newAmount = D.sub(reverseAmount, amount);
        newGraph = G.upsertEdge(newGraph, to, from, newAmount);
      }
    }
  }
  return newGraph;
};

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
      let amount = D.create(amountValue, fractions);
      if (conversionRate) amount = D.mul(amount, conversionRate);
      graph = G.upsertEdge(graph, userID, payer, amount);
    }
  }

  return graph;
};

export const calculateExpenseGraph = (split: SplitWithData) => {
  return cancelMutual(createGraphWithCurrency(split.currency, split.expenses));
};

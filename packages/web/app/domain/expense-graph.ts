import { currencies } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import * as G from "@tasan/common/graph";
import type { UserID } from "@tasan/common/id";
import type { SplitWithData } from "@tasan/data";

const cancelMutual = (graph: G.Graph): G.Graph => {
  let newGraph = G.create();
  const skipEdgeMap = new WeakMap<G.Edge, boolean>();

  for (const [fromStr, edges] of Object.entries(graph)) {
    const from = fromStr as UserID;
    for (const edge of edges) {
      if (skipEdgeMap.get(edge)) continue;
      const { to, amount } = edge;
      const reverseEdge = graph[to].find((e) => e.to === from);
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

export const calculateGraph = (split: SplitWithData) => {
  let graph = G.create();
  const { currency } = split;
  const fractions = currencies[currency].fractions;
  for (const expense of split.expenses) {
    const { payer, conversionRate } = expense;
    for (const [userID, amountValue] of Object.entries(expense.participants)) {
      if (userID === payer) continue;
      let amount = D.create(amountValue, fractions);
      if (conversionRate) amount = D.mul(amount, conversionRate);
      graph = G.upsertEdge(graph, userID as UserID, payer, amount);
    }
  }
  return cancelMutual(graph);
};

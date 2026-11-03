import type { UserID } from "./id.js";
import * as M from "./money.js";

export interface Edge {
  to: UserID;
  amount: M.Money;
}

export type Graph = Map<UserID, Edge[]>;

export const create = (): Graph => new Map();

export const upsertEdge = (
  graph: Graph,
  from: UserID,
  to: UserID,
  amount: M.Money,
): Graph => {
  const edges = graph.get(from) ?? [];
  const existingEdge = edges.find((edge) => edge.to === to);
  if (existingEdge) existingEdge.amount = M.add(existingEdge.amount, amount);
  else edges.push({ to, amount });
  return new Map(graph).set(from, edges);
};

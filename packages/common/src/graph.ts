import * as D from "./decimal.js";
import type { UserID } from "./id.js";

export interface Edge {
  to: UserID;
  amount: D.Decimal;
}

export type Graph = Readonly<Record<UserID, Edge[]>>;

export const create = (): Graph => Object.create(null) as Graph;

export const upsertEdge = (
  graph: Graph,
  from: UserID,
  to: UserID,
  amount: D.Decimal,
): Graph => {
  const edges = graph[from] ?? [];
  const existingEdge = edges.find((edge) => edge.to === to);
  if (existingEdge) existingEdge.amount = D.add(existingEdge.amount, amount);
  else edges.push({ to, amount });
  return { ...graph, [from]: edges };
};

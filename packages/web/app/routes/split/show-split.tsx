import * as D from "@tasan/common/decimal";
import { href, useRouteLoaderData } from "react-router";

import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { DescriptionList } from "~/components/description-list";
import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";
import { useLanguage } from "~/context";
import { calculateExpenseGraph } from "~/domain/expense-graph";
import ExpenseListItem from "~/routes/split/components/expense-list-item";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-split";

export default function ShowSplit(_: Route.ComponentProps) {
  const language = useLanguage();
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const expenseGraph = calculateExpenseGraph(split);
  return (
    <div>
      <MainHeading>Split - {split.name}</MainHeading>
      <DescriptionList
        className="mb-2"
        items={[
          ["Created at", split.createdAt.toLocaleString(language)],
          ["Home currency", split.currency],
          ["Created by", users.find((u) => u.id === split.createdBy)?.name],
        ]}
      />

      <Card
        heading={<SubHeading>Participants</SubHeading>}
        action={
          <Link
            to={href("/splits/:splitID/invite", { splitID: split.id })}
            variant="plain"
          >
            <Button>Invite</Button>
          </Link>
        }
      >
        <ul>
          {users.map((u) => {
            const isYou = session.userID === u.id;
            return (
              <li key={u.id}>
                {u.name} {isYou ? " (you!)" : ""}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card heading={<SubHeading>Debts</SubHeading>}>
        <ul>
          {expenseGraph.size === 0 &&
            "No debts between participants. You are all settled!"}
          {[...expenseGraph].map(([from, edges]) => {
            const fromName = users.find((u) => u.id === from)?.name;
            return edges.map((edge) => {
              const toName = users.find((u) => u.id === edge.to)?.name;
              return (
                <li key={from + edge.to}>
                  {fromName} owes {toName} {split.currency}{" "}
                  {D.toString(edge.amount)}
                </li>
              );
            });
          })}
        </ul>
      </Card>

      <Card
        heading={<SubHeading>Expenses</SubHeading>}
        action={
          <Link
            to={href("/splits/:splitID/new-expense", { splitID: split.id })}
            variant="plain"
          >
            <Button>New expense</Button>
          </Link>
        }
      >
        {split.expenses.length === 0 ?
          "No expenses yet."
        : <ul className="space-y-2">
            {split.expenses.map((expense) => (
              <ExpenseListItem
                key={expense.id}
                expense={expense}
                currency={split.currency}
                users={users}
                currentUserID={session.userID}
                splitID={split.id}
              />
            ))}
          </ul>
        }
      </Card>
    </div>
  );
}

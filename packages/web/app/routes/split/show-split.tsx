import { currencies } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import { href, useRouteLoaderData } from "react-router";

import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-split";

export default function ShowSplit(_: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  return (
    <div>
      <MainHeading>Split - {split.name}</MainHeading>
      <dl className="mb-2 grid grid-cols-[max-content_auto] gap-x-4">
        <dt>Home currency:</dt>
        <dd>{split.currency}</dd>
        <dt>Created by:</dt>
        <dd>{users.find((u) => u.id === split.createdBy)?.name}</dd>
      </dl>

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
            {split.expenses.map((expense) => {
              const yourShare = expense.participants[session.userID] ?? 0;
              const fractions = currencies[split.currency].fractions;
              return (
                <li key={expense.id}>
                  <div>
                    {expense.name} - {expense.createdAt.toISOString()}
                  </div>
                  <div>
                    {users.find((u) => u.id === expense.payer)?.name} paid{" "}
                    {expense.currency} {expense.amount}{" "}
                    {expense.conversionRate &&
                      `(${split.currency} ${D.toString(D.mul(D.create(expense.amount, fractions), expense.conversionRate))})`}
                  </div>
                  <div>
                    {yourShare === 0 ?
                      "You didn't participate"
                    : `Your share: ${expense.currency} ${D.toString(D.create(yourShare, currencies[expense.currency].fractions))}`
                    }
                  </div>
                </li>
              );
            })}
          </ul>
        }
      </Card>
    </div>
  );
}

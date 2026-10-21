import { compareByKey, compareByTo } from "@tasan/common/compare";
import * as D from "@tasan/common/decimal";
import { genExpenseID } from "@tasan/common/id";
import classNames from "classnames";
import { useState } from "react";
import { href, useRouteLoaderData } from "react-router";

import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { DateRender } from "~/components/date";
import { DescriptionList } from "~/components/description-list";
import { MainHeading, SubHeading } from "~/components/heading";
import { Link } from "~/components/link";
import {
  calculateBalances,
  calculateExpenseGraph,
} from "~/domain/expense-graph";
import { calculateExpenseSummary } from "~/domain/expense-summary";
import ExpenseListItem from "~/routes/split/components/expense-list-item";
import {
  type PaymentDraft,
  RecordPaymentModal,
} from "~/routes/split/components/record-payment-modal";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-split";

export default function ShowSplit(_: Route.ComponentProps) {
  const [payment, setPayment] = useState<PaymentDraft>();
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const expenses = split.expenses.filter((entry) => entry.kind !== "repayment");
  const payments = split.expenses.filter((entry) => entry.kind === "repayment");
  const summary = calculateExpenseSummary(
    split.expenses,
    split.currency,
    session.userID,
  );
  const expenseGraph = calculateExpenseGraph(split);
  const balances = calculateBalances(
    expenseGraph,
    users.map((u) => u.id),
    split.currency,
  );
  return (
    <div>
      <MainHeading>Split - {split.name}</MainHeading>
      <DescriptionList
        className="mb-2"
        items={[
          ["Created at", <DateRender date={split.createdAt} />],
          ["Home currency", split.currency],
          ["Created by", users.find((u) => u.id === split.createdBy)?.name],
        ]}
      />

      <Card heading={<SubHeading>Summary</SubHeading>}>
        <DescriptionList
          items={[
            [
              "Total expenses",
              <AmountRender amount={summary.total} currency={split.currency} />,
            ],
            [
              "Your share",
              <AmountRender amount={summary.share} currency={split.currency} />,
            ],
            [
              "You paid",
              <AmountRender amount={summary.paid} currency={split.currency} />,
            ],
          ]}
        />
      </Card>

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
        <ol className="clear-both">
          {balances.map(({ userID, balance }) => {
            const isYou = session.userID === userID;
            return (
              <li key={userID} className="flex justify-between gap-2">
                <span>
                  {users.find((u) => u.id === userID)?.name}
                  {isYou ? " (you!)" : ""}
                </span>
                <span
                  className={classNames(
                    "tabular-nums",
                    D.gt(balance, 0) && "text-green-700 dark:text-green-400",
                    balance.value < 0 && "text-red-700 dark:text-red-400",
                  )}
                >
                  <AmountRender
                    amount={balance}
                    currency={split.currency}
                    signDisplay="exceptZero"
                  />
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card heading={<SubHeading>Repayments</SubHeading>}>
        <p className="mb-2">
          Simplified payments keep everyone’s balance the same. You may pay
          someone who didn’t originally pay for you.
        </p>
        {expenseGraph.size > 0 && (
          <p className="mb-1 text-sm">Select a repayment to record it.</p>
        )}
        <ul>
          {expenseGraph.size === 0 &&
            "No debts between participants. You are all settled!"}
          {[...expenseGraph].sort(compareByKey).map(([from, edges]) => {
            const fromName = users.find((u) => u.id === from)?.name;
            return edges.sort(compareByTo).map((edge) => {
              const toName = users.find((u) => u.id === edge.to)?.name;
              return (
                <li key={from + edge.to}>
                  <button
                    type="button"
                    className="outline-brand-700 dark:outline-brand-300 grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-2 text-left hover:bg-gray-100 focus-visible:outline-2 dark:hover:bg-gray-800"
                    onClick={() => {
                      setPayment({
                        id: genExpenseID(),
                        payer: from,
                        recipient: edge.to,
                        payerName: fromName ?? "Unknown",
                        recipientName: toName ?? "Unknown",
                        amount: edge.amount,
                      });
                    }}
                  >
                    <span className="min-w-0 leading-tight break-words">
                      <span className="sr-only">Record payment from </span>
                      {fromName ?? "Unknown"}
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only"> to </span>
                      {toName ?? "Unknown"}
                    </span>
                    <span className="text-right whitespace-nowrap tabular-nums">
                      <AmountRender
                        amount={edge.amount}
                        currency={split.currency}
                      />
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </li>
              );
            });
          })}
        </ul>
      </Card>

      {payment && (
        <RecordPaymentModal
          key={payment.id}
          payment={payment}
          splitID={split.id}
          currency={split.currency}
          onClose={() => {
            setPayment(undefined);
          }}
        />
      )}
      {payments.length > 0 && (
        <Card heading={<SubHeading>Recorded payments</SubHeading>}>
          <ul className="space-y-2">
            {payments.map((entry) => (
              <ExpenseListItem
                key={entry.id}
                expense={entry}
                currency={split.currency}
                users={users}
                currentUserID={session.userID}
                splitID={split.id}
              />
            ))}
          </ul>
        </Card>
      )}
      <Card
        heading={<SubHeading>Expenses ({expenses.length})</SubHeading>}
        action={
          <Link
            to={href("/splits/:splitID/new-expense", { splitID: split.id })}
            prefetch="render"
            variant="plain"
          >
            <Button>New expense</Button>
          </Link>
        }
      >
        {expenses.length === 0 ?
          "No expenses yet."
        : <ul className="space-y-2">
            {expenses.map((expense) => (
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

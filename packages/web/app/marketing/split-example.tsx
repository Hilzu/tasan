import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import classNames from "classnames";

import { AmountRender, AmountWithConversion } from "~/components/amount";
import { Card } from "~/components/card";
import { DateRender } from "~/components/date";
import { DescriptionList } from "~/components/description-list";
import { SubHeading } from "~/components/heading";

export interface ExampleSplit {
  name: string;
  title: string;
  expenses: {
    name: string;
    paidBy: string;
    amount: number;
    original?: { amount: number; currency: CurrencySymbol };
  }[];
  payments: { from: string; amount: number }[];
}

const exampleDate = new Date("2026-11-01T12:00:00Z");
const people = ["Alex", "Sam", "Jo"];

export function SplitExample({ example }: { example: ExampleSplit }) {
  const total = example.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const share = total / people.length;
  const participants = people
    .map((name) => {
      const paid = example.expenses
        .filter((expense) => expense.paidBy === name)
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { name, paid, balance: paid - share };
    })
    .sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name));
  const alexPaid = participants.find(({ name }) => name === "Alex")?.paid ?? 0;

  return (
    <>
      <h2 className="mb-2 text-2xl font-semibold">Split - {example.title}</h2>
      <DescriptionList
        className="mb-2"
        items={[
          ["Created at", <DateRender date={exampleDate} />],
          ["Home currency", "EUR"],
          ["Created by", "Alex"],
        ]}
      />
      <Card heading={<SubHeading>Summary</SubHeading>}>
        <DescriptionList
          items={[
            [
              "Total expenses",
              <AmountRender amount={D.create(total)} currency="EUR" />,
            ],
            [
              "Your share",
              <AmountRender amount={D.create(share)} currency="EUR" />,
            ],
            [
              "You paid",
              <AmountRender amount={D.create(alexPaid)} currency="EUR" />,
            ],
          ]}
        />
      </Card>
      <Card heading={<SubHeading>Participants</SubHeading>}>
        <ol>
          {participants.map(({ name, balance }) => (
            <li key={name} className="flex justify-between gap-2">
              <span>
                {name}
                {name === "Alex" ? " (you!)" : ""}
              </span>
              <span
                className={classNames(
                  "tabular-nums",
                  balance > 0 && "text-green-700 dark:text-green-400",
                  balance < 0 && "text-red-700 dark:text-red-400",
                )}
              >
                <AmountRender
                  amount={D.create(balance)}
                  currency="EUR"
                  signDisplay="exceptZero"
                />
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <Card heading={<SubHeading>Repayments</SubHeading>}>
        <p className="mb-2">
          Simplified payments keep everyone’s balance the same. You may pay
          someone who didn’t originally pay for you.
        </p>
        <ul>
          {example.payments.map((payment) => (
            <li
              key={payment.from}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-2"
            >
              <span>
                {payment.from} <span aria-hidden="true">→</span>
                <span className="sr-only">pays</span> Alex
              </span>
              <span className="text-right whitespace-nowrap tabular-nums">
                <AmountRender
                  amount={D.create(payment.amount)}
                  currency="EUR"
                />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        heading={<SubHeading>Expenses ({example.expenses.length})</SubHeading>}
      >
        <ul className="space-y-2">
          {example.expenses.map((expense) => (
            <li key={expense.name} className="space-y-1 leading-tight">
              <p className="text-brand-700 dark:text-brand-300 font-semibold">
                {expense.name}
              </p>
              <p>
                <AmountWithConversion
                  amount={D.create(expense.original?.amount ?? expense.amount)}
                  currency={expense.original?.currency ?? "EUR"}
                  convertedAmount={
                    expense.original ? D.create(expense.amount) : undefined
                  }
                  convertedCurrency="EUR"
                />{" "}
                paid by {expense.paidBy}
              </p>
              <p>
                Your share is{" "}
                <AmountWithConversion
                  amount={D.create(
                    (expense.original?.amount ?? expense.amount) /
                      people.length,
                  )}
                  currency={expense.original?.currency ?? "EUR"}
                  convertedAmount={
                    expense.original ?
                      D.create(expense.amount / people.length)
                    : undefined
                  }
                  convertedCurrency="EUR"
                />
              </p>
              <p className="text-xs">
                <DateRender date={exampleDate} />
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

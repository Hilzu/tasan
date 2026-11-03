import type { CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import classNames from "classnames";

import { AmountRender, AmountWithConversion } from "~/components/amount";
import { Card } from "~/components/card";
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
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {example.title}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Alex, Sam &amp; Jo · Totals in EUR
        </p>
      </div>
      <Card heading={<SubHeading>Summary</SubHeading>}>
        <DescriptionList
          className="mt-2 gap-y-1 text-sm"
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
      <Card
        className="border-t border-gray-200 pt-4 dark:border-gray-700"
        heading={<SubHeading>Participants</SubHeading>}
      >
        <ol className="mt-2 text-sm">
          {participants.map(({ name, balance }) => (
            <li
              key={name}
              className="flex min-h-8 items-center justify-between gap-2"
            >
              <span>
                {name}
                {name === "Alex" ? " (you)" : ""}
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
      <Card
        className="border-t border-gray-200 pt-4 dark:border-gray-700"
        heading={<SubHeading>Repayments</SubHeading>}
      >
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {example.payments.length} payment
          {example.payments.length === 1 ? "" : "s"} to settle up.
        </p>
        <ul className="bg-brand-50 dark:bg-brand-900/40 mt-3 rounded-lg px-3 py-1 text-sm">
          {example.payments.map((payment) => (
            <li
              key={payment.from}
              className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"
            >
              <span>
                {payment.from} <span aria-hidden="true">→</span>
                <span className="sr-only">pays</span> Alex
              </span>
              <span className="text-right font-medium whitespace-nowrap tabular-nums">
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
        className="border-t border-gray-200 pt-4 dark:border-gray-700"
        heading={<SubHeading>Expenses ({example.expenses.length})</SubHeading>}
      >
        <ul className="mt-3 space-y-4">
          {example.expenses.map((expense) => (
            <li key={expense.name} className="space-y-1 text-sm leading-snug">
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
                />
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Paid by {expense.paidBy}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

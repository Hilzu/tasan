import * as M from "@tasan/common/money";
import classNames from "classnames";

import { AmountWithConversion, MoneyRender } from "~/components/amount";
import { Card } from "~/components/card";
import { DescriptionList } from "~/components/description-list";
import { SubHeading } from "~/components/heading";

import { calculateExample, type ExampleSplit, viewer } from "./example-splits";

export function SplitExample({ example }: { example: ExampleSplit }) {
  const { total, expenses, participants, payments } = calculateExample(example);
  const you = participants.find(({ name }) => name === viewer);
  const zero = M.create("0", "EUR");

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
            ["Total expenses", <MoneyRender amount={total} />],
            ["Your share", <MoneyRender amount={you?.share ?? zero} />],
            ["You paid", <MoneyRender amount={you?.paid ?? zero} />],
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
                {name === viewer ? " (you)" : ""}
              </span>
              <span
                className={classNames(
                  "tabular-nums",
                  M.gt(balance, 0) && "text-green-700 dark:text-green-400",
                  balance.minorUnits < 0n && "text-red-700 dark:text-red-400",
                )}
              >
                <MoneyRender amount={balance} signDisplay="exceptZero" />
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
          {payments.length} payment
          {payments.length === 1 ? "" : "s"} to settle up.
        </p>
        <ul className="bg-brand-50 dark:bg-brand-900/40 mt-3 rounded-lg px-3 py-1 text-sm">
          {payments.map(({ from, to, amount }) => (
            <li
              key={`${from}-${to}`}
              className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"
            >
              <span>
                {from} <span aria-hidden="true">→</span>
                <span className="sr-only">pays</span> {to}
              </span>
              <span className="text-right font-medium whitespace-nowrap tabular-nums">
                <MoneyRender amount={amount} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        className="border-t border-gray-200 pt-4 dark:border-gray-700"
        heading={<SubHeading>Expenses ({expenses.length})</SubHeading>}
      >
        <ul className="mt-3 space-y-4">
          {expenses.map((expense) => (
            <li key={expense.name} className="space-y-1 text-sm leading-snug">
              <p className="text-brand-700 dark:text-brand-300 font-semibold">
                {expense.name}
              </p>
              <p>
                <AmountWithConversion
                  amount={M.create(
                    expense.original?.amount ?? expense.amount,
                    expense.original?.currency ?? "EUR",
                  )}
                  convertedAmount={
                    expense.original ?
                      M.create(expense.amount, "EUR")
                    : undefined
                  }
                />
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Paid by {expense.paidBy} · Your share{" "}
                <MoneyRender amount={expense.owed.get(viewer) ?? zero} />
              </p>
              {expense.note && (
                <p className="bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100 inline-block rounded-md px-2 py-0.5 text-xs">
                  {expense.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

import * as M from "@tasan/common/money";

import { MoneyRender } from "~/components/amount";
import { Card } from "~/components/card";
import { SubHeading } from "~/components/heading";

import { calculateExample, type ExampleSplit } from "./example-splits";

// Only the expenses and the resulting repayments, so each example fits
// without scrolling.
export function SplitExample({ example }: { example: ExampleSplit }) {
  const { total, expenses, payments } = calculateExample(example);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {example.title}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Alex, Sam &amp; Jo · Totals in EUR
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-xs text-gray-600 dark:text-gray-300">
            Total
          </span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            <MoneyRender amount={total} />
          </span>
        </p>
      </div>
      <Card heading={<SubHeading>Expenses</SubHeading>}>
        <ul className="mt-1 divide-y divide-gray-200 text-sm dark:divide-gray-700">
          {expenses.map((expense) => (
            <li key={expense.name} className="py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 leading-snug">
                <p className="text-brand-700 dark:text-brand-300 font-semibold">
                  {expense.name}
                </p>
                <p className="text-right font-medium whitespace-nowrap tabular-nums">
                  <MoneyRender
                    amount={M.create(
                      expense.original?.amount ?? expense.amount,
                      expense.original?.currency ?? "EUR",
                    )}
                  />
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Paid by {expense.paidBy}
                </p>
                {expense.original && (
                  <p className="text-right text-xs whitespace-nowrap text-gray-600 tabular-nums dark:text-gray-300">
                    (<MoneyRender amount={M.create(expense.amount, "EUR")} />)
                  </p>
                )}
              </div>
              {expense.note && (
                <p className="bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100 mt-1.5 inline-block rounded-md px-2 py-0.5 text-xs">
                  {expense.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card heading={<SubHeading>Repayments</SubHeading>}>
        <ul className="bg-brand-50 dark:bg-brand-900/40 mt-2 rounded-lg px-3 py-1 text-sm">
          {payments.map(({ from, to, amount }) => (
            <li
              key={`${from}-${to}`}
              className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5"
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
    </div>
  );
}

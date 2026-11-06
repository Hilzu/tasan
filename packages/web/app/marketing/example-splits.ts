import type { CurrencySymbol } from "@tasan/common/currency";
import * as G from "@tasan/common/graph";
import type { UserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";

import { calculateShareAmounts } from "~/domain/expense-amounts";
import { simplifyDebts } from "~/domain/expense-graph";

export const people = ["Alex", "Sam", "Jo"] as const;
export type Person = (typeof people)[number];

export interface ExampleExpense {
  name: string;
  paidBy: Person;
  // In EUR, the home currency of every example.
  amount: string;
  original?: { amount: string; currency: CurrencySymbol };
  // Missing people get one share and no adjustment.
  shares?: Partial<Record<Person, string>>;
  adjustments?: Partial<Record<Person, string>>;
  note?: string;
}

export interface ExampleSplit {
  name: string;
  title: string;
  caption: string;
  expenses: ExampleExpense[];
}

const exampleData = [
  {
    name: "Weekend away",
    title: "A little escape",
    caption: "GBP, EUR & USD → one total in EUR. Illustrative rates.",
    expenses: [
      {
        name: "Cabin",
        paidBy: "Alex",
        amount: "240",
        original: { amount: "204", currency: "GBP" },
      },
      { name: "Groceries", paidBy: "Sam", amount: "60" },
      {
        name: "Train tickets",
        paidBy: "Jo",
        amount: "60",
        original: { amount: "66", currency: "USD" },
      },
    ],
  },
  {
    name: "Dinner out",
    title: "One more course",
    caption: "Sam’s plus-one counts twice. Alex covers the champagne.",
    expenses: [
      {
        name: "Dinner",
        paidBy: "Alex",
        amount: "120",
        shares: { Sam: "2" },
        note: "Sam brought a plus-one: 2 shares",
      },
      {
        name: "Drinks",
        paidBy: "Sam",
        amount: "36",
        adjustments: { Alex: "12" },
        note: "Alex’s champagne added as an adjustment",
      },
    ],
  },
  {
    name: "Shared home",
    title: "Under one roof",
    caption: "Bills split by room size, right down to the cent.",
    expenses: [
      { name: "Groceries", paidBy: "Alex", amount: "120" },
      {
        name: "Electricity",
        paidBy: "Sam",
        amount: "90",
        shares: { Alex: "1.5" },
        note: "By room size: Alex 1.5 shares",
      },
    ],
  },
] satisfies ExampleSplit[];

const eur = (value: string) => M.create(value, "EUR");
// Names stand in for user IDs so the app's own calculations can be reused.
export const exampleUserID = (person: Person) => person as string as UserID;

// Each expense is split like the expense form would, then repayments are
// simplified like on the split page.
const calculateExample = (example: ExampleSplit) => {
  const expenses = example.expenses.map((expense) => {
    const { participants } = calculateShareAmounts(
      eur(expense.amount),
      new Map(
        people.map((person) => {
          const adjustment = expense.adjustments?.[person];
          return [
            exampleUserID(person),
            {
              shares: expense.shares?.[person] ?? "1",
              adjustment: adjustment ? eur(adjustment) : undefined,
            },
          ] as const;
        }),
      ),
      "EUR",
      exampleUserID(expense.paidBy),
    );
    const owed = new Map(
      people.map(
        (person) =>
          [
            person,
            participants.get(exampleUserID(person)) ?? eur("0"),
          ] as const,
      ),
    );
    return { ...expense, owed };
  });

  let graph = G.create();
  for (const expense of expenses)
    for (const [person, amount] of expense.owed)
      if (person !== expense.paidBy && M.gt(amount, 0))
        graph = G.upsertEdge(
          graph,
          exampleUserID(person),
          exampleUserID(expense.paidBy),
          amount,
        );
  const payments = [...simplifyDebts(graph, "EUR")].flatMap(([from, edges]) =>
    edges.map(({ to, amount }) => ({
      from: from as string as Person,
      to: to as string as Person,
      amount,
    })),
  );

  return {
    ...example,
    total: expenses.map(({ amount }) => eur(amount)).reduce(M.add, eur("0")),
    expenses,
    payments,
  };
};

// The data is static, so every example is calculated once at load.
export const examples = exampleData.map(calculateExample);
export type Example = (typeof examples)[number];

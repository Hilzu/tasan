import assert from "node:assert/strict";
import { test } from "node:test";

import type { CurrencySymbol } from "@tasan/common/currency";
import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import * as M from "@tasan/common/money";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import { ExpenseForm } from "./expense-form";

const render = (
  splitCurrency: CurrencySymbol,
  expenseCurrency?: CurrencySymbol,
) => {
  const userID = genUserID();
  const splitID = genSplitID();
  const expense = expenseCurrency && {
    id: genExpenseID(),
    splitID,
    kind: "expense",
    name: "Dinner",
    currency: expenseCurrency,
    amount: M.create("10", expenseCurrency),
    payer: userID,
    createdBy: userID,
    createdAt: new Date("2026-11-06T00:00:00Z"),
    participants: new Map([[userID, M.create("10", expenseCurrency)]]),
  };
  const router = createMemoryRouter(
    [
      {
        id: "split-parent",
        path: "/splits/:splitID",
        loader: () => null,
        Component: () =>
          createElement(ExpenseForm, {
            expense: expense as Parameters<typeof ExpenseForm>[0]["expense"],
          }),
      },
    ],
    {
      initialEntries: [`/splits/${splitID}`],
      hydrationData: {
        loaderData: {
          "split-parent": {
            split: { id: splitID, currency: splitCurrency },
            users: [{ id: userID, name: "Tester" }],
            session: { userID },
          },
        },
      },
    },
  );
  try {
    return renderToStaticMarkup(createElement(RouterProvider, { router }));
  } finally {
    router.dispose();
  }
};

const currencyOptions = (html: string) => {
  const select = /<select[^>]*name="currency"[^>]*>(.*?)<\/select>/s.exec(
    html,
  )?.[1];
  assert.ok(select, "currency select rendered");
  return {
    values: [...select.matchAll(/<option[^>]*value="([A-Z]{3})"/g)].map(
      ([, value]) => value,
    ),
    selected: /<option[^>]*value="([A-Z]{3})"[^>]*selected/.exec(select)?.[1],
  };
};

await test("the expense currency picker hides historic currencies not in use", () => {
  const { values, selected } = currencyOptions(render("EUR"));
  assert.ok(!values.includes("BGN"));
  assert.ok(values.includes("EUR"));
  assert.equal(selected, "EUR");
});

await test("the expense currency picker keeps historic currencies the split or expense uses", () => {
  const inSplit = currencyOptions(render("BGN"));
  assert.ok(inSplit.values.includes("BGN"));
  assert.equal(inSplit.selected, "BGN");
  const inExpense = currencyOptions(render("EUR", "BGN"));
  assert.ok(inExpense.values.includes("BGN"));
  assert.equal(inExpense.selected, "BGN");
});

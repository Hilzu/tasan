import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { genExpenseID, genSplitID, genUserID } from "@tasan/common/id";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createContext,
  createMemoryRouter,
  RouterProvider,
} from "react-router";

mock.module("~/.server/auth", {
  namedExports: { authenticatedSessionContext: createContext() },
});
mock.module("~/.server/services/expenses", {
  namedExports: {
    deleteExpense: mock.fn(),
    getExpenseHistory: mock.fn(),
  },
});
const { default: ShowExpense } = await import("./show-expense");

for (const [name, errors, message] of [
  [
    "conflict",
    {
      formErrors: ["This operation ID has already been used."],
      fieldErrors: {},
    },
    "This operation ID has already been used.",
  ],
  [
    "validation",
    { formErrors: [], fieldErrors: { operationID: ["Invalid operation ID"] } },
    "Unable to delete expense. Please refresh the page and try again.",
  ],
] as const) {
  await test(`expense deletion displays ${name} action errors`, () => {
    const userID = genUserID();
    const splitID = genSplitID();
    const expenseID = genExpenseID();
    const props = {
      params: { splitID, expenseID },
      loaderData: {
        expense: {
          id: expenseID,
          splitID,
          name: "Dinner",
          currency: "JPY",
          amount: { value: 1000, fractions: 0 },
          payer: userID,
          createdBy: userID,
          createdAt: new Date("2026-10-17T00:00:00Z"),
          participants: new Map([[userID, { value: 1000, fractions: 0 }]]),
        },
        history: [],
      },
      actionData: { errors },
      matches: [],
    } as unknown as Parameters<typeof ShowExpense>[0];
    const router = createMemoryRouter(
      [
        {
          id: "split-parent",
          path: "/splits/:splitID/:expenseID",
          loader: () => null,
          Component: () => createElement(ShowExpense, props),
        },
      ],
      {
        initialEntries: [`/splits/${splitID}/${expenseID}`],
        hydrationData: {
          loaderData: {
            "split-parent": {
              split: { id: splitID, currency: "JPY" },
              users: [{ id: userID, name: "Tester" }],
            },
          },
        },
      },
    );
    try {
      const html = renderToStaticMarkup(
        createElement(RouterProvider, { router }),
      );
      assert.ok(html.includes(message));
      assert.ok(html.includes("Expense - Dinner"));
    } finally {
      router.dispose();
    }
  });
}

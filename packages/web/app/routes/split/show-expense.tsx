import { compareByKey } from "@tasan/common/compare";
import * as D from "@tasan/common/decimal";
import { asExpenseID, asSplitID } from "@tasan/common/id";
import { useState } from "react";
import { href, redirect, useRouteLoaderData, useSubmit } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { deleteExpense } from "~/.server/services/expenses";
import { errorResponse } from "~/.server/services/http";
import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { DateRender } from "~/components/date";
import { DescriptionList } from "~/components/description-list";
import { MainHeading } from "~/components/heading";
import { showInCurrency } from "~/domain/show-in-currency";
import { DeleteExpenseModal } from "~/routes/split/components/delete-expense-modal";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-expense";

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitID = asSplitID(params.splitID);
  const expenseID = asExpenseID(params.expenseID);

  try {
    await deleteExpense(session.userID, splitID, expenseID);
    return redirect(href("/splits/:splitID", { splitID }));
  } catch (error) {
    throw errorResponse(error);
  }
}

export default function ShowExpense({ params }: Route.ComponentProps) {
  const { expenseID } = params;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submitDelete = useSubmit();
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users } = parentData;
  const expense = split.expenses.find((e) => e.id === expenseID);
  if (!expense) return <div>No such expense.</div>;
  const exchangeRate =
    expense.conversionRate ? (1 / expense.conversionRate).toFixed(5) : "-";
  return (
    <Card
      heading={<MainHeading>Expense - {expense.name}</MainHeading>}
      action={
        <Button
          variant="danger"
          onClick={() => {
            setDeleteOpen(true);
          }}
        >
          Delete
        </Button>
      }
    >
      <DescriptionList
        className="mb-2"
        items={[
          [
            "Amount",
            `${expense.currency} ${D.toString(expense.amount)} ${showInCurrency(expense.amount, split.currency, expense.conversionRate)}`,
          ],
          ["Created by", users.find((u) => u.id === expense.createdBy)?.name],
          ["Paid by", users.find((u) => u.id === expense.payer)?.name],
          ["Created at", <DateRender date={expense.createdAt} />],
          ["Exchange rate", exchangeRate],
          [
            "Participants",
            <div className="space-y-1 leading-tight">
              {[...expense.participants]
                .sort(compareByKey)
                .map(([userID, amount]) => (
                  <div key={userID}>
                    {users.find((u) => u.id === userID)?.name}:{" "}
                    {expense.currency} {D.toString(amount)}{" "}
                    {showInCurrency(
                      amount,
                      split.currency,
                      expense.conversionRate,
                    )}
                  </div>
                ))}
            </div>,
          ],
        ]}
      />
      <DeleteExpenseModal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
        }}
        onDelete={() => {
          submitDelete({}, { method: "post" }).catch((err: unknown) => {
            console.error("Failed to submit!", err);
          });
        }}
      />
    </Card>
  );
}

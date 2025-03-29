import { compareByKey } from "@tasan/common/compare";
import * as D from "@tasan/common/decimal";
import { asExpenseID, asSplitID } from "@tasan/common/id";
import { deleteSplitExpense, getSplitUser } from "@tasan/data";
import { useState } from "react";
import { href, redirect, useRouteLoaderData, useSubmit } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { Button } from "~/components/button";
import { Card } from "~/components/card";
import { DescriptionList } from "~/components/description-list";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import { showInCurrency } from "~/domain/show-in-currency";
import { DeleteExpenseModal } from "~/routes/split/components/delete-expense-modal";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-expense";

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitID = asSplitID(params.splitID);
  const expenseID = asExpenseID(params.expenseID);

  const splitUser = await getSplitUser(session.userID, splitID);
  if (!splitUser) throw new Error("Split user not found");

  await deleteSplitExpense(splitID, expenseID, session.userID);
  return redirect(href("/splits/:splitID", { splitID }));
}

export default function ShowExpense({ params }: Route.ComponentProps) {
  const { expenseID } = params;
  const language = useLanguage();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submitDelete = useSubmit();
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users } = parentData;
  const expense = split.expenses.find((e) => e.id === expenseID);
  if (!expense) return <div>No such expense.</div>;
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
          ["Created at", expense.createdAt.toLocaleString(language)],
          ["Conversion rate", expense.conversionRate],
          [
            "Participants",
            <div>
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

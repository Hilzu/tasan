import { compareByKey } from "@tasan/common/compare";
import * as D from "@tasan/common/decimal";
import { useContext } from "react";
import { useRouteLoaderData } from "react-router";

import { DescriptionList } from "~/components/description-list";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import { showInCurrency } from "~/domain/show-in-currency";
import type { SplitLoader } from "~/routes/split/split-parent";

import type { Route } from "./+types/show-expense";

export default function ShowExpense({ params }: Route.ComponentProps) {
  const { expenseID } = params;
  const language = useLanguage();
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users } = parentData;
  const expense = split.expenses.find((e) => e.id === expenseID);
  if (!expense) return <div>No such expense.</div>;
  return (
    <div>
      <MainHeading>Expense - {expense.name}</MainHeading>
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
    </div>
  );
}

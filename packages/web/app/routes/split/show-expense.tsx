import { compareByKey } from "@tasan/common/compare";
import { asExpenseID, asSplitID, genOperationID } from "@tasan/common/id";
import { Fragment, useEffect, useState } from "react";
import {
  data,
  href,
  redirect,
  useNavigation,
  useRouteLoaderData,
  useSubmit,
} from "react-router";

import { authenticatedSessionContext } from "~/.server/auth";
import { ApplicationError } from "~/.server/services/errors";
import { deleteExpense, getExpenseHistory } from "~/.server/services/expenses";
import { errorResponse } from "~/.server/services/http";
import { ActionsDropdown } from "~/components/actions-dropdown";
import { AmountRender, ConvertedAmount } from "~/components/amount";
import { Card } from "~/components/card";
import { DateRender } from "~/components/date";
import { DescriptionList } from "~/components/description-list";
import { FieldError } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import { DeleteExpenseModal } from "~/routes/split/components/delete-expense-modal";
import type { SplitLoader } from "~/routes/split/split-parent";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/show-expense";
import { deleteExpenseFormSchema } from "./new-expense-form";

export async function loader({ params, context }: Route.LoaderArgs) {
  try {
    return await getExpenseHistory(
      context.get(authenticatedSessionContext).userID,
      asSplitID(params.splitID),
      asExpenseID(params.expenseID),
    );
  } catch (error) {
    throw errorResponse(error);
  }
}

export async function action({ params, context, request }: Route.ActionArgs) {
  const session = context.get(authenticatedSessionContext);

  const splitID = asSplitID(params.splitID);
  const expenseID = asExpenseID(params.expenseID);

  const result = validateOrRespond(
    deleteExpenseFormSchema,
    await request.formData(),
  );
  if (result.response) return result.response;
  try {
    await deleteExpense(
      session.userID,
      splitID,
      expenseID,
      result.data.operationID,
    );
    return redirect(href("/splits/:splitID", { splitID }));
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "conflict")
      return data(
        { errors: { formErrors: [error.message], fieldErrors: {} } },
        { status: 409 },
      );
    throw errorResponse(error);
  }
}

export default function ShowExpense(props: Route.ComponentProps) {
  return <ExpenseDetails key={props.params.expenseID} {...props} />;
}

function ExpenseDetails({
  params,
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const language = useLanguage();
  const { expenseID } = params;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const [operationID, setOperationID] = useState("");
  useEffect(() => {
    setOperationID(genOperationID());
  }, [expenseID]);
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users } = parentData;
  const { expense } = loaderData;
  const repayment = expense.kind === "repayment";
  const exchangeRate =
    expense.conversionRate ?
      new Intl.NumberFormat(language, {
        minimumFractionDigits: 5,
        maximumFractionDigits: 5,
      }).format(1 / expense.conversionRate)
    : "-";
  return (
    <Card
      heading={
        <MainHeading>
          {repayment ? "Recorded payment" : `Expense - ${expense.name}`}
        </MainHeading>
      }
      action={
        <ActionsDropdown
          label={repayment ? "Payment actions" : "Expense actions"}
          items={[
            ...(repayment ?
              []
            : [
                {
                  label: "Edit",
                  to: href("/splits/:splitID/:expenseID/edit", {
                    splitID: split.id,
                    expenseID: expense.id,
                  }),
                },
              ]),
            {
              label: "Delete",
              destructive: true,
              disabled: navigation.state !== "idle" || !operationID,
              onSelect: () => {
                setDeleteOpen(true);
              },
            },
          ]}
        />
      }
    >
      <DescriptionList
        className="mb-2"
        items={[
          [
            "Amount",
            <>
              <AmountRender
                amount={expense.amount}
                currency={expense.currency}
              />{" "}
              <ConvertedAmount
                amount={expense.amount}
                currency={split.currency}
                exchangeRate={expense.conversionRate}
              />
            </>,
          ],
          ["Created by", users.find((u) => u.id === expense.createdBy)?.name],
          ["Paid by", users.find((u) => u.id === expense.payer)?.name],
          ["Created at", <DateRender date={expense.createdAt} />],
          ...(repayment ?
            []
          : [["Exchange rate", exchangeRate] as [string, string]]),
          [
            repayment ? "Paid to" : "Participants",
            <div className="space-y-1 leading-tight">
              {[...expense.participants]
                .sort(compareByKey)
                .map(([userID, amount]) => (
                  <div key={userID}>
                    {users.find((u) => u.id === userID)?.name}:{" "}
                    <AmountRender amount={amount} currency={expense.currency} />{" "}
                    <ConvertedAmount
                      amount={amount}
                      currency={split.currency}
                      exchangeRate={expense.conversionRate}
                    />
                  </div>
                ))}
            </div>,
          ],
        ]}
      />
      {actionData?.errors && (
        <FieldError
          errors={
            actionData.errors.formErrors.length ?
              actionData.errors.formErrors
            : [
                `Unable to delete ${repayment ? "payment" : "expense"}. Please refresh the page and try again.`,
              ]
          }
        />
      )}
      {expense.updatedAt && (
        <p>
          Last updated <DateRender date={expense.updatedAt} /> by{" "}
          {users.find((u) => u.id === expense.updatedBy)?.name}
        </p>
      )}
      {loaderData.history.length > 1 && (
        <details className="mt-4">
          <summary>{repayment ? "Payment history" : "Expense history"}</summary>
          <ol className="mt-2 space-y-3">
            {[...loaderData.history].reverse().map((revision) => (
              <li key={revision.operationID ?? revision.expense.id}>
                <p>
                  {revision.action} by{" "}
                  {users.find((u) => u.id === revision.recordedBy)?.name} —{" "}
                  <DateRender date={revision.recordedAt} />
                </p>
                <p>
                  {revision.expense.name}:{" "}
                  <AmountRender
                    amount={revision.expense.amount}
                    currency={revision.expense.currency}
                  />
                  , paid by{" "}
                  {users.find((u) => u.id === revision.expense.payer)?.name}
                </p>
                <p>
                  {[...revision.expense.participants].map(
                    ([id, amount], index) => (
                      <Fragment key={id}>
                        {index > 0 && ", "}
                        {users.find((u) => u.id === id)?.name ??
                          "Unknown"}:{" "}
                        <AmountRender
                          amount={amount}
                          currency={revision.expense.currency}
                        />
                      </Fragment>
                    ),
                  )}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <DeleteExpenseModal
        repayment={repayment}
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
        }}
        onDelete={() => {
          setDeleteOpen(false);
          void submit({ operationID }, { method: "post" });
        }}
      />
    </Card>
  );
}

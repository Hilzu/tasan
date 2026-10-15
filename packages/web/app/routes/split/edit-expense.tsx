import { asExpenseID, asSplitID, asUserID } from "@tasan/common/id";
import { data, href, redirect } from "react-router";

import { authenticatedSessionContext } from "~/.server/auth";
import { ApplicationError } from "~/.server/services/errors";
import { editExpense, requireExpense } from "~/.server/services/expenses";
import { errorResponse, formErrorResponse } from "~/.server/services/http";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/edit-expense";
import { ExpenseForm } from "./expense-form";
import { editExpenseFormSchema } from "./new-expense-form";

export async function loader({ params, context }: Route.LoaderArgs) {
  try {
    return {
      expense: await requireExpense(
        context.get(authenticatedSessionContext).userID,
        asSplitID(params.splitID),
        asExpenseID(params.expenseID),
      ),
    };
  } catch (error) {
    throw errorResponse(error);
  }
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const splitID = asSplitID(params.splitID);
  const expenseID = asExpenseID(params.expenseID);
  const result = validateOrRespond(
    editExpenseFormSchema,
    await request.formData(),
  );
  if (result.response) return result.response;
  const input = result.data;
  try {
    await editExpense(
      context.get(authenticatedSessionContext).userID,
      splitID,
      expenseID,
      {
        operationID: input.operationID,
        expectedVersion: input.expectedVersion,
      },
      {
        name: input.expenseName,
        amount: input.amount,
        currency: input.currency,
        payer: input.payer,
        participants: new Map(
          Object.entries(input.participants).map(([id, amount]) => [
            asUserID(id),
            amount,
          ]),
        ),
      },
    );
    return redirect(
      href("/splits/:splitID/:expenseID", { splitID, expenseID }),
    );
  } catch (error) {
    // Keep the draft mounted so a conflict never discards the user's input.
    if (
      error instanceof ApplicationError &&
      (error.code === "conflict" || error.code === "not_found")
    )
      return data(
        { errors: { formErrors: [error.message], fieldErrors: {} } },
        { status: error.code === "conflict" ? 409 : 404 },
      );
    return formErrorResponse(error, { name: "expenseName" });
  }
}

export default function EditExpense({ loaderData }: Route.ComponentProps) {
  return (
    <ExpenseForm key={loaderData.expense.id} expense={loaderData.expense} />
  );
}

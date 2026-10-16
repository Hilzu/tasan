import { asSplitID, asUserID } from "@tasan/common/id";
import { data as respond, href, redirect } from "react-router";

import { authenticatedSessionContext } from "~/.server/auth";
import { ApplicationError } from "~/.server/services/errors";
import { createExpense } from "~/.server/services/expenses";
import { formErrorResponse } from "~/.server/services/http";
import { newExpenseFormSchema } from "~/routes/split/new-expense-form";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-expense";
import { ExpenseForm } from "./expense-form";

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = context.get(authenticatedSessionContext);

  const splitID = asSplitID(params.splitID);
  const formData = await request.formData();
  const result = validateOrRespond(newExpenseFormSchema, formData);
  if (result.response) return result.response;
  const { data } = result;

  const participants = new Map(
    Object.entries(data.participants).map(([k, v]) => [asUserID(k), v]),
  );
  try {
    await createExpense(session.userID, splitID, {
      id: data.expenseID,
      name: data.expenseName,
      currency: data.currency,
      amount: data.amount,
      payer: data.payer,
      participants,
    });
    return redirect(href("/splits/:splitID", { splitID }));
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "conflict")
      return respond(
        { errors: { formErrors: [error.message], fieldErrors: {} } },
        { status: 409 },
      );
    return formErrorResponse(error, { name: "expenseName" });
  }
}

export default function NewExpense(_: Route.ComponentProps) {
  return <ExpenseForm />;
}

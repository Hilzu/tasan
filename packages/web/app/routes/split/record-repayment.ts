import { asSplitID } from "@tasan/common/id";
import { expenseIDSchema, userIDSchema } from "@tasan/common/validation";
import { data } from "react-router";
import { zfd } from "zod-form-data";

import { authenticatedSessionContext } from "~/.server/auth";
import { ApplicationError } from "~/.server/services/errors";
import { recordRepayment } from "~/.server/services/expenses";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/record-repayment";

const schema = zfd.formData({
  id: zfd.text(expenseIDSchema),
  payer: zfd.text(userIDSchema),
  recipient: zfd.text(userIDSchema),
  amount: zfd.numeric(),
});

export async function action({ request, params, context }: Route.ActionArgs) {
  const result = validateOrRespond(schema, await request.formData());
  if (result.response)
    return data(
      { error: "Invalid payment. Refresh the page and try again." },
      { status: 400 },
    );
  try {
    await recordRepayment(
      context.get(authenticatedSessionContext).userID,
      asSplitID(params.splitID),
      result.data,
    );
    return { saved: true };
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
    return data(
      { error: error.message },
      {
        status:
          error.code === "conflict" ? 409
          : error.code === "not_found" ? 404
          : 400,
      },
    );
  }
}

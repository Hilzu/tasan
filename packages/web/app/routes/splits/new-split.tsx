import { currencies } from "@tasan/common/currency";
import { currencySymbolSchema } from "@tasan/common/validation";
import { Form, href, redirect } from "react-router";
import { zfd } from "zod-form-data";

import { getSessionOrRedirect } from "~/.server/auth";
import { formErrorResponse } from "~/.server/services/http";
import { createSplit } from "~/.server/services/splits";
import { Button } from "~/components/button";
import { FieldError, InputField, SelectField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-split";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Create a new split - Tasan.app" }];
}

const schema = zfd.formData({
  name: zfd.text(),
  currency: zfd.text(currencySymbolSchema),
});

export async function action({ request }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const formData = await request.formData();
  const result = validateOrRespond(schema, formData);
  if (result.response) return result.response;

  try {
    const { id } = await createSplit(session.userID, result.data);
    return redirect(href("/splits/:splitID", { splitID: id }));
  } catch (error) {
    return formErrorResponse(error);
  }
}

export default function NewSplit({ actionData }: Route.ComponentProps) {
  return (
    <div>
      <MainHeading>Create a new split</MainHeading>
      <Form method="post" className="max-w-md space-y-2">
        <InputField
          label="Name"
          name="name"
          autoComplete="off"
          minLength={1}
          maxLength={64}
          errors={actionData?.errors.fieldErrors.name}
        />
        <SelectField
          label="Home currency"
          name="currency"
          description="All expenses will be converted to this currency."
          errors={actionData?.errors.fieldErrors.currency}
        >
          {Object.entries(currencies).map(([symbol, currency]) => (
            <option key={symbol} value={symbol}>
              {currency.name} ({symbol})
            </option>
          ))}
        </SelectField>
        <Button type="submit" className="mt-2">
          Create
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </Form>
    </div>
  );
}

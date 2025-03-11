import { createSplit } from "@tasan/data";
import { Form, href, redirect } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";

import { getSessionOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { FieldError, InputField, SelectField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { currencies } from "~/currencies";
import { currencySymbolSchema, validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-split";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Create a new split - Tasan.app" }];
}

const schema = zfd.formData({
  splitName: zfd.text(z.string().min(1).max(64)),
  currency: zfd.text(currencySymbolSchema),
});

export async function action({ request }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const formData = await request.formData();
  const result = validateOrRespond(schema, formData);
  if (result.response) return result.response;

  const { id } = await createSplit({
    name: result.data.splitName,
    createdBy: session.userID,
    currency: result.data.currency,
  });
  return redirect(href("/splits/:splitID", { splitID: id }));
}

export default function NewSplit({ actionData }: Route.ComponentProps) {
  return (
    <div>
      <MainHeading>Create a new split</MainHeading>
      <Form method="post" className="max-w-md space-y-2">
        <InputField
          label="Name"
          name="splitName"
          minLength={1}
          maxLength={64}
          errors={actionData?.errors.fieldErrors.splitName}
        />
        <SelectField
          label="Home currency"
          name="currency"
          description="All expenses will be converted to this currency."
          errors={actionData?.errors.fieldErrors.currency}
        >
          {Object.entries(currencies).map(([symbol, name]) => (
            <option key={symbol} value={symbol}>
              {name} ({symbol})
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

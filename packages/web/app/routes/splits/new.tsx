import { createSplit } from "@tasan/data";
import { data, Form, redirect } from "react-router";
import { type inferFlattenedErrors, z } from "zod";
import { zfd } from "zod-form-data";

import { getSessionOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { FieldError, FormField, TextField } from "~/components/formField";
import { MainHeading } from "~/components/heading";

import type { Route } from "./+types/new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Create a new split - Tasan.app" }];
}

const schema = zfd.formData({
  splitName: zfd.text(z.string().min(1).max(64)),
  splitDescription: zfd.text(z.string().max(255).optional()),
});

export async function action({ request }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  // TODO: extract form validation to a shared function
  const formData = await request.formData();
  const result = schema.safeParse(formData);
  if (!result.success) {
    const errors = result.error.flatten() as inferFlattenedErrors<
      typeof schema
    >;
    return data({ errors }, { status: 400 });
  }

  const { id } = await createSplit({
    name: result.data.splitName,
    description: result.data.splitDescription,
    createdBy: session.userID,
  });
  return redirect(`/splits/${id}`);
}

export default function NewSplit({ actionData }: Route.ComponentProps) {
  return (
    <div>
      <MainHeading>Create a new split</MainHeading>
      <Form method="post" className="max-w-md space-y-2">
        <FormField
          label="Name"
          name="splitName"
          minLength={1}
          maxLength={64}
          errors={actionData?.errors.fieldErrors.splitName}
        />
        <TextField
          label="Description"
          name="splitDescription"
          maxLength={255}
          errors={actionData?.errors.fieldErrors.splitDescription}
        />
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

import { data, Form, redirect } from "react-router";
import { type inferFlattenedErrors, z } from "zod";
import { zfd } from "zod-form-data";

import { Button } from "~/components/button";
import { FieldError, FormField } from "~/components/formField";
import { genUserId } from "~/ids";
import { commitSession, getSession } from "~/sessions.server";

import type { Route } from "./+types/sign-up";

export function meta() {
  return [
    { title: "Sign Up - Tasan.app" },
    { name: "description", content: "Sign up for an account." },
  ];
}

const schema = zfd.formData({
  name: zfd.text(z.string().min(1).max(64)),
});

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const result = schema.safeParse(formData);
  console.log("result", result);
  if (!result.success) {
    const errors = result.error.flatten() as inferFlattenedErrors<
      typeof schema
    >;
    return data({ errors }, { status: 400 });
  }

  // TODO: Save user to database.

  const session = await getSession(request.headers.get("cookie"));
  session.set("id", genUserId());
  session.set("name", data.name);

  const url = new URL(request.url);
  const to = url.searchParams.get("redirect") ?? "/splits";

  return redirect(to, {
    status: 303,
    headers: { "set-cookie": await commitSession(session) },
  });
}

export default function SignUp({ actionData }: Route.ComponentProps) {
  console.log("actionData", actionData);
  return (
    <main className="mx-auto max-w-md px-4">
      <h1 className="pt-16 text-center text-xl font-bold">Sign Up</h1>
      <Form method="post" className="mt-4" navigate>
        <FormField
          label="Name"
          name="name"
          minLength={1}
          maxLength={64}
          description="This is used to refer to you."
          autoComplete="name"
          errors={actionData?.errors.fieldErrors.name}
        />
        <Button type="submit" className="mt-4">
          Sign Up
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </Form>
    </main>
  );
}

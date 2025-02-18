import { createUser } from "@tasan/data";
import { data, Form, redirect, useSearchParams } from "react-router";
import { type inferFlattenedErrors, z } from "zod";
import { zfd } from "zod-form-data";

import { Button } from "~/components/button";
import { FieldError, FormField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { Link } from "~/components/link";
import { commitSession, getSession } from "~/sessions.server";
import { toRelativePath } from "~/url";

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
  if (!result.success) {
    const errors = result.error.flatten() as inferFlattenedErrors<
      typeof schema
    >;
    return data({ errors }, { status: 400 });
  }

  const { id } = await createUser({ name: result.data.name });

  const session = await getSession(request.headers.get("cookie"));
  session.set("userID", id);

  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect");
  const to = redirectParam ? toRelativePath(redirectParam) : "/splits";

  return redirect(to, {
    headers: { "set-cookie": await commitSession(session) },
  });
}

export default function SignUp({ actionData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  return (
    <main className="mx-auto max-w-md px-4">
      <MainHeading>Sign Up</MainHeading>
      <Form method="post" className="mt-4" navigate>
        <FormField
          label="Name"
          name="name"
          minLength={1}
          maxLength={64}
          description="This is used to refer to you."
          autoComplete="nickname name"
          errors={actionData?.errors.fieldErrors.name}
        />
        <Button type="submit" className="mt-4">
          Sign Up
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </Form>
      <p className="mt-4">
        Already have an account?{" "}
        <Link to={{ pathname: "/log-in", search: searchParams.toString() }}>
          Log in
        </Link>
      </p>
    </main>
  );
}

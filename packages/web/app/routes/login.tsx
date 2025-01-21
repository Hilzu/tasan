import { getUser } from "@tasan/data";
import { data, Form, redirect, useSearchParams } from "react-router";
import { type inferFlattenedErrors, z } from "zod";
import { zfd } from "zod-form-data";

import { Button } from "~/components/button";
import { FieldError, FormField } from "~/components/formField";
import { Link } from "~/components/link";
import { commitSession, getSession } from "~/sessions.server";
import { toRelativePath } from "~/url";

import type { Route } from "./+types/login";

export function meta() {
  return [
    { title: "Log in - Tasan.app" },
    { name: "description", content: "Log in to Tasan.app." },
  ];
}

const schema = zfd.formData({
  userid: zfd.text(z.string().min(30).max(30)),
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

  const user = await getUser(result.data.userid);
  if (!user) {
    return data({
      errors: {
        fieldErrors: { userid: undefined },
        formErrors: ["User not found"],
      },
      status: 401,
    });
  }

  const session = await getSession(request.headers.get("cookie"));
  session.set("userId", user.id);

  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect");
  const to = redirectParam ? toRelativePath(redirectParam) : "/splits";

  return redirect(to, {
    headers: { "set-cookie": await commitSession(session) },
  });
}

export default function LogIn({ actionData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  return (
    <main className="mx-auto max-w-md px-4">
      <h1 className="pt-16 text-center text-xl font-bold">Log in</h1>
      <Form method="post" className="mt-4">
        <FormField
          label="Username"
          name="userid"
          minLength={30}
          maxLength={30}
          description="Put in your user ID."
          autoComplete="username"
          errors={actionData?.errors.fieldErrors.userid}
        />
        <Button type="submit" className="mt-4">
          Log in
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </Form>
      <p className="mt-4">
        Don't have an account?{" "}
        <Link to={{ pathname: "/sign-up", search: searchParams.toString() }}>
          Sign up
        </Link>
      </p>
    </main>
  );
}

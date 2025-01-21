import { Form, redirect } from "react-router";

import { Button } from "~/components/button";
import { destroySession, getSession } from "~/sessions.server";

import type { Route } from "./+types/logout";

export function meta() {
  return [
    { title: "Log out - Tasan.app" },
    { name: "description", content: "Log out from an account." },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("cookie"));
  return redirect("/", {
    headers: { "set-cookie": await destroySession(session) },
  });
}

export default function SignUp(_: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-md px-4 text-center">
      <h1 className="pt-16 text-xl font-bold">Log out</h1>
      <p>Are you sure you want to log out?</p>
      <Form method="post" className="mt-4">
        <Button type="submit" className="mt-4">
          Logout
        </Button>
      </Form>
    </main>
  );
}

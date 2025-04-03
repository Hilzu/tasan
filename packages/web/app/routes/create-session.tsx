import { asUserID } from "@tasan/common/id";
import { Form, href, redirect } from "react-router";

import { commitSession, getSession } from "~/.server/sessions";
import { Button } from "~/components/button";
import { InputField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { appEnv, authDisable } from "~/config";

import type { Route } from "./+types/create-session";

export async function action({ request }: Route.ActionArgs) {
  if (appEnv !== "local") throw new Error("Can't create session outside local");
  if (!authDisable) throw new Error("Auth is enabled");

  const session = await getSession(request.headers.get("cookie"));
  const formData = await request.formData();
  const userID = formData.get("userID");
  if (!userID) throw new Error("No user ID in form data");
  if (typeof userID !== "string") throw new Error("Expected string");

  session.set("userID", asUserID(userID));

  return redirect(href("/splits"), {
    headers: { "set-cookie": await commitSession(session) },
  });
}

export default function CreateSession() {
  return (
    <div>
      <MainHeading>Create session for user ID</MainHeading>
      <p>This only works if auth is disabled.</p>
      <Form className="max-w-md space-y-2" method="post">
        <InputField label="User ID" name="userID" required className="mb-2" />
        <Button type="submit">Create</Button>
      </Form>
    </div>
  );
}

import { asInviteID } from "@tasan/common/id";
import { Form, href, redirect } from "react-router";

import { getSessionOrRedirect } from "~/.server/auth";
import { application } from "~/.server/services";
import { runApplication } from "~/.server/services/http";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";

import type { Route } from "./+types/accept-invite";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { inviteID } = params;
  return runApplication(() => application.previewInvite(asInviteID(inviteID)));
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { inviteID } = params;
  const { splitID } = await runApplication(() =>
    application.acceptInvite(session.userID, asInviteID(inviteID)),
  );

  return redirect(href("/splits/:splitID", { splitID }));
}

export default function AcceptInvite({ loaderData }: Route.ComponentProps) {
  const { split } = loaderData;
  return (
    <div className="text-center">
      <MainHeading>Accept invite to {split.name} split?</MainHeading>
      <p className="mb-4">This invite will be used after accepting it.</p>
      <Form method="post">
        <Button type="submit">Accept</Button>
      </Form>
    </div>
  );
}

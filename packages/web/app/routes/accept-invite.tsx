import {
  createSplitUser,
  deleteInviteForSplit,
  findInviteForSplit,
  getSplit,
} from "@tasan/data";
import { Form, href, redirect } from "react-router";

import { getSessionOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";

import type { Route } from "./+types/accept-invite";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { inviteID } = params;
  const inviteForSplit = await findInviteForSplit(inviteID);
  if (!inviteForSplit) throw new Error("Invite not found");

  const split = await getSplit(inviteForSplit.splitID);
  if (!split) throw new Error("Split not found");

  return { split };
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const { inviteID } = params;
  const inviteForSplit = await findInviteForSplit(inviteID);
  if (!inviteForSplit) throw new Error("Invite not found");

  await Promise.all([
    createSplitUser({
      userID: session.userID,
      splitID: inviteForSplit.splitID,
      createdBy: inviteForSplit.createdBy,
    }),
    deleteInviteForSplit(inviteForSplit.id, inviteForSplit.splitID),
  ]);

  return redirect(
    href("/splits/:splitID", { splitID: inviteForSplit.splitID }),
  );
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

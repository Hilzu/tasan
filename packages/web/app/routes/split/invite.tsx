import { createInviteForSplit, getUserSplit } from "@tasan/data";
import { useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";

import { getUserOrRedirect } from "~/auth.server";
import { Button } from "~/components/button";
import { MainHeading } from "~/components/heading";
import { Link } from "~/components/link";
import type { SplitLoader } from "~/routes/split/parent";
import { canShare, copyToClipboard, createShareHandler } from "~/utils.client";

import type { Route } from "./+types/invite";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  if (user instanceof Response) return user;

  const { splitID } = params;
  const userSplit = await getUserSplit({ userID: user.id, splitID });
  if (!userSplit) throw new Error("Split not found");

  const inviteForSplit = await createInviteForSplit({
    createdBy: user.id,
    splitID: userSplit.splitID,
  });

  const inviteURL = new URL(
    `/accept-invite/${encodeURIComponent(inviteForSplit.id)}`,
    request.url,
  );
  return { inviteURL };
}

const ShareButton = ({ share }: { share: ShareData }) => {
  if (!canShare(share)) return null;
  return (
    <Button variant="secondary" onClick={createShareHandler(share)}>
      Share
    </Button>
  );
};

export default function SplitInvite(_: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split } = parentData;

  const fetcher = useFetcher<typeof action>();

  const [copied, setCopied] = useState(false);
  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div>
      <MainHeading>Invite participants to {split.name} split</MainHeading>
      <p className="mb-2">
        Do you want to invite someone to this split? The invite is single-use
        and will expire after about a week.
      </p>
      <fetcher.Form method="post" className="mb-8">
        <Button type="submit">Invite</Button>
      </fetcher.Form>
      {fetcher.data && (
        <div className="flex flex-col gap-1">
          <Link to={fetcher.data.inviteURL.href}>
            {fetcher.data.inviteURL.href}
          </Link>
          <div className="space-x-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (!fetcher.data) return;
                void handleCopy(fetcher.data.inviteURL.href);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
            <ShareButton
              share={{
                title: "Tasan.app",
                text: `Join my split on Tasan.app: ${split.name}`,
                url: fetcher.data.inviteURL.href,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

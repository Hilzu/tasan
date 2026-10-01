import type { InviteID, SplitID, UserID } from "@tasan/common/id";
import {
  consumeInviteForSplit,
  createInviteForSplit,
  findInviteForSplit,
} from "@tasan/data";

import { ApplicationError } from "./errors";
import { requireMembership, requireSplit } from "./splits";

const requireInvite = async (inviteID: InviteID) => {
  const invite = await findInviteForSplit(inviteID);
  if (!invite || invite.expiresAt.getTime() <= Date.now())
    throw new ApplicationError("not_found", "Invite not found or expired.");
  return invite;
};

export const createInvite = async (actorID: UserID, splitID: SplitID) => {
  await requireMembership(actorID, splitID);
  await requireSplit(splitID);
  return createInviteForSplit({ splitID, createdBy: actorID });
};

export const previewInvite = async (inviteID: InviteID) => {
  const invite = await requireInvite(inviteID);
  return { split: await requireSplit(invite.splitID) };
};

export const acceptInvite = async (actorID: UserID, inviteID: InviteID) => {
  const invite = await requireInvite(inviteID);
  await requireSplit(invite.splitID);
  if (!(await consumeInviteForSplit(invite, actorID)))
    throw new ApplicationError("not_found", "Invite not found or expired.");
  return { splitID: invite.splitID };
};

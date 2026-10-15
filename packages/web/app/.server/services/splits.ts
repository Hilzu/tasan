import type { CurrencySymbol } from "@tasan/common/currency";
import type { SplitID, UserID } from "@tasan/common/id";
import { getLogger } from "@tasan/common/logging";
import {
  createSplit as persistSplit,
  findUsersSplits,
  getSplit as getSplitData,
  getSplitUser,
  getSplitWithData,
  getUsers,
} from "@tasan/data";

import { ApplicationError } from "./errors";
import { logAction } from "./logging";
import { validateCurrency, validateName } from "./validation";

export interface NewSplit {
  name: string;
  currency: CurrencySymbol;
}

export const requireMembership = async (actorID: UserID, splitID: SplitID) => {
  if (!(await getSplitUser(actorID, splitID)))
    throw new ApplicationError("not_found", "Split not found.");
};

export const requireSplit = async (splitID: SplitID) => {
  const split = await getSplitData(splitID);
  if (!split) throw new ApplicationError("not_found", "Split not found.");
  return split;
};

export const listSplits = (actorID: UserID) => findUsersSplits(actorID);

export const createSplit = async (actorID: UserID, input: NewSplit) => {
  return logAction(
    "split.create",
    { userId: actorID, parameters: { currency: input.currency } },
    async () => {
      validateName(input.name);
      validateCurrency(input.currency);
      const result = await persistSplit({ ...input, createdBy: actorID });
      getLogger().appendKeys({ splitId: result.id });
      return result;
    },
  );
};

export const getSplit = async (actorID: UserID, splitID: SplitID) => {
  const split = await getSplitWithData(splitID);
  if (!split?.userIDs.has(actorID))
    throw new ApplicationError("not_found", "Split not found.");
  const users = await getUsers(split.userIDs);
  return { split, users };
};

import { BatchGetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidUserID,
  genSplitID,
  type SplitID,
  type UserID,
} from "../ids.js";
import { createUserSplit, findUserSplitIDs } from "./user-split.js";

export interface Split {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  users: Set<string>;
}

interface SplitItem {
  pk: SplitID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
  name: string;
  description?: string;
  users: Set<string>;
}

type PrimaryKey = Pick<SplitItem, "pk" | "sk">;

export type CreateSplit = Omit<Split, "id" | "users">;

export const createSplit = async (
  split: CreateSplit,
): Promise<{ id: string }> => {
  assertValidUserID(split.createdBy);
  const id = genSplitID();
  const Item: SplitItem = {
    pk: id,
    sk: id,
    createdAt: new Date().toISOString(),
    createdBy: split.createdBy,
    name: split.name,
    description: split.description,
    users: new Set([split.createdBy]),
  };
  const cmd = new PutCommand({ TableName, Item });

  const userSplitPromise = createUserSplit({
    userID: split.createdBy,
    splitID: id,
    createdBy: split.createdBy,
  });

  await Promise.all([documentClient.send(cmd), userSplitPromise]);

  return { id };
};

export const findUsersSplits = async (userID: string): Promise<Split[]> => {
  assertValidUserID(userID);

  const splitIDs = await findUserSplitIDs(userID);
  if (!splitIDs.length) return [];

  const Keys: PrimaryKey[] = splitIDs.map((splitID) => ({
    pk: splitID,
    sk: splitID,
  }));
  const cmd = new BatchGetCommand({
    RequestItems: { [TableName]: { Keys } },
  });
  const { Responses } = await documentClient.send(cmd);

  const Items = Responses?.[TableName];
  if (!Items?.length) return [];

  return Items.map((Item) => {
    const item = Item as SplitItem;
    return {
      id: item.pk,
      name: item.name,
      description: item.description,
      createdBy: item.createdBy,
      users: item.users,
    };
  });
};

import {
  BatchGetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { compareById } from "../compare.js";
import { TableName } from "../config.js";
import {
  assertValidSplitID,
  assertValidUserID,
  genSplitID,
  type SplitID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../tracing.js";
import { createSplitUser, findUserSplitIDs } from "./split-user.js";

export interface Split {
  id: string;
  name: string;
  createdBy: string;
  homeCurrency: string;
}

interface SplitItem {
  pk: SplitID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
  name: string;
  homeCurrency: string;
}

type PrimaryKey = Pick<SplitItem, "pk" | "sk">;

const fromItem = (Item: Record<string, unknown>): Split => {
  const item = Item as unknown as SplitItem;
  return {
    id: item.pk,
    name: item.name,
    createdBy: item.createdBy,
    homeCurrency: item.homeCurrency,
  };
};

export type CreateSplit = Omit<Split, "id" | "users">;

export const createSplit = captureAsync(
  "createSplit",
  async (split: CreateSplit): Promise<{ id: string }> => {
    assertValidUserID(split.createdBy);
    const id = genSplitID();
    const Item: SplitItem = {
      pk: id,
      sk: id,
      createdAt: new Date().toISOString(),
      createdBy: split.createdBy,
      name: split.name,
      homeCurrency: split.homeCurrency,
    };
    const cmd = new PutCommand({ TableName, Item });

    const splitUserPromise = createSplitUser({
      userID: split.createdBy,
      splitID: id,
      createdBy: split.createdBy,
    });

    await Promise.all([documentClient().send(cmd), splitUserPromise]);

    return { id };
  },
);

export const findUsersSplits = captureAsync(
  "findUsersSplits",
  async (userID: string): Promise<Split[]> => {
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
    const { Responses } = await documentClient().send(cmd);

    const Items = Responses?.[TableName];
    if (!Items?.length) return [];

    return Items.map(fromItem).sort(compareById).reverse();
  },
);

export type WithUsers<T> = T & { userIDs: Set<string> };

export const getSplit = captureAsync(
  "getSplit",
  async (splitID: string): Promise<WithUsers<Split> | undefined> => {
    assertValidSplitID(splitID);

    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": splitID },
    });
    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return;

    let split: Split | undefined;
    const userIDs = new Set<string>();
    for (const Item of Items) {
      if (typeof Item.sk !== "string") continue;
      if (Item.sk === splitID) split = fromItem(Item);
      else if (Item.sk.startsWith("usr_")) userIDs.add(Item.sk);
    }

    return split ? { ...split, userIDs } : undefined;
  },
);

import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { SplitID, UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { reversedKeyIndexName, TableName } from "../config.js";

export interface SplitUser {
  userID: UserID;
  splitID: SplitID;
  createdBy: UserID;
}

interface SplitUserItem {
  pk: SplitID;
  sk: UserID;
  createdAt: string;
  createdBy: UserID;
}

type PrimaryKey = Pick<SplitUserItem, "pk" | "sk">;

const fromItem = (Item: Record<string, unknown>): SplitUser => {
  const item = Item as unknown as SplitUserItem;
  return {
    userID: item.sk,
    splitID: item.pk,
    createdBy: item.createdBy,
  };
};

export const createSplitUser = captureAsync(
  "createSplitUser",
  async (splitUser: SplitUser): Promise<void> => {
    const Item: SplitUserItem = {
      pk: splitUser.splitID,
      sk: splitUser.userID,
      createdAt: new Date().toISOString(),
      createdBy: splitUser.createdBy,
    };

    const cmd = new PutCommand({ TableName, Item });
    await documentClient().send(cmd);
  },
);

export const findUserSplitIDs = captureAsync(
  "findUserSplitIDs",
  async (userID: UserID): Promise<SplitID[]> => {
    const cmd = new QueryCommand({
      TableName,
      IndexName: reversedKeyIndexName,
      KeyConditionExpression: "sk = :sk and begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":sk": userID, ":prefix": "spl_" },
    });

    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return [];

    return Items.map((item) => (item as SplitUserItem).pk);
  },
);

export const getSplitUser = captureAsync(
  "getSplitUser",
  async (userID: UserID, splitID: SplitID): Promise<SplitUser | undefined> => {
    const Key: PrimaryKey = { pk: splitID, sk: userID };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    return fromItem(Item);
  },
);

export const findSplitUsers = captureAsync(
  "findSplitUsers",
  async (splitID: SplitID): Promise<SplitUser[]> => {
    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": splitID, ":prefix": "usr_" },
    });

    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return [];

    return Items.map((item) => fromItem(item));
  },
);

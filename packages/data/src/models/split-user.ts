import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { SplitID, UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { reversedKeyIndexName, TableName } from "../config.js";
import {
  parseItem,
  type SplitUserItem,
  splitUserItemSchema,
} from "../items.js";

export interface SplitUser {
  userID: UserID;
  splitID: SplitID;
  createdBy: UserID;
}

type PrimaryKey = Pick<SplitUserItem, "pk" | "sk">;

// The reverse index projects keys only, not membership metadata.
const keySchema = splitUserItemSchema.pick({ pk: true, sk: true });

const fromItem = (item: SplitUserItem): SplitUser => {
  return {
    userID: item.sk,
    splitID: item.pk,
    createdBy: item.createdBy,
  };
};

export const toItem = (
  splitUser: SplitUser,
  createdAt = new Date().toISOString(),
): SplitUserItem => ({
  pk: splitUser.splitID,
  sk: splitUser.userID,
  createdAt,
  createdBy: splitUser.createdBy,
});

export const createSplitUser = captureAsync(
  "createSplitUser",
  async (splitUser: SplitUser): Promise<void> => {
    const Item = toItem(splitUser);

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

    return Items.map(
      (item) => parseItem(keySchema, item, "split membership key").pk,
    );
  },
);

export const getSplitUser = captureAsync(
  "getSplitUser",
  async (userID: UserID, splitID: SplitID): Promise<SplitUser | undefined> => {
    const Key: PrimaryKey = { pk: splitID, sk: userID };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    return fromItem(parseItem(splitUserItemSchema, Item, "split-user"));
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

    return Items.map((item) =>
      fromItem(parseItem(splitUserItemSchema, item, "split-user")),
    );
  },
);

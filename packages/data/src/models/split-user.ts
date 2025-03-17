import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { reversedKeyIndexName, TableName } from "../config.js";
import {
  assertValidSplitID,
  assertValidUserID,
  type SplitID,
  type UserID,
} from "../ids.js";

export interface SplitUser {
  userID: string;
  splitID: string;
  createdBy: string;
}

interface SplitUserItem {
  pk: SplitID;
  sk: UserID;
  createdAt: string;
  createdBy: UserID;
}

type PrimaryKey = Pick<SplitUserItem, "pk" | "sk">;

export const createSplitUser = captureAsync(
  "createSplitUser",
  async (splitUser: SplitUser): Promise<void> => {
    assertValidUserID(splitUser.userID);
    assertValidUserID(splitUser.createdBy);
    assertValidSplitID(splitUser.splitID);

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
  async (userID: string): Promise<SplitID[]> => {
    assertValidUserID(userID);

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
  async ({
    userID,
    splitID,
  }: Pick<SplitUser, "userID" | "splitID">): Promise<SplitUser | undefined> => {
    assertValidUserID(userID);
    assertValidSplitID(splitID);

    const Key: PrimaryKey = { pk: splitID, sk: userID };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    const item = Item as SplitUserItem;
    return {
      splitID: item.pk,
      userID: item.sk,
      createdBy: item.createdBy,
    };
  },
);

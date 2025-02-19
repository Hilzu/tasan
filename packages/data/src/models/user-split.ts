import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidSplitID,
  assertValidUserID,
  type SplitID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../segment.js";

export interface UserSplit {
  userID: string;
  splitID: string;
  createdBy: string;
}

interface UserSplitItem {
  pk: UserID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
}

type PrimaryKey = Pick<UserSplitItem, "pk" | "sk">;

export const createUserSplit = captureAsync(
  "createUserSplit",
  async (userSplit: UserSplit): Promise<void> => {
    assertValidUserID(userSplit.userID);
    assertValidUserID(userSplit.createdBy);
    assertValidSplitID(userSplit.splitID);

    const Item: UserSplitItem = {
      pk: userSplit.userID,
      sk: userSplit.splitID,
      createdAt: new Date().toISOString(),
      createdBy: userSplit.createdBy,
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
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": userID, ":prefix": "spl_" },
    });

    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return [];

    return Items.map((item) => (item as UserSplitItem).sk);
  },
);

export const getUserSplit = captureAsync(
  "getUserSplit",
  async ({
    userID,
    splitID,
  }: Pick<UserSplit, "userID" | "splitID">): Promise<UserSplit | undefined> => {
    assertValidUserID(userID);
    assertValidSplitID(splitID);

    const Key: PrimaryKey = { pk: userID, sk: splitID };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    const item = Item as UserSplitItem;
    return {
      userID: item.pk,
      splitID: item.sk,
      createdBy: item.createdBy,
    };
  },
);

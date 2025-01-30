import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidSplitID,
  assertValidUserID,
  type SplitID,
  type UserID,
} from "../ids.js";

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

export const createUserSplit = async (userSplit: UserSplit): Promise<void> => {
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
  await documentClient.send(cmd);
};

export const findUserSplitIDs = async (userID: string): Promise<SplitID[]> => {
  assertValidUserID(userID);

  const cmd = new QueryCommand({
    TableName,
    KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": userID, ":prefix": "spl_" },
  });

  const { Items } = await documentClient.send(cmd);
  if (!Items?.length) return [];

  return Items.map((item) => (item as UserSplitItem).sk);
};

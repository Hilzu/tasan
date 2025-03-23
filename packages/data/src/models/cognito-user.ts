import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { type CognitoUserID, genUserID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";

export interface CognitoUser {
  cognitoID: CognitoUserID;
  userID: UserID;
  createdAt: Date;
}

interface CognitoUserItem {
  pk: CognitoUserID;
  sk: UserID;
  createdAt: string;
}

const fromItem = (Item: Record<string, unknown>): CognitoUser => {
  const item = Item as unknown as CognitoUserItem;
  return {
    cognitoID: item.pk,
    userID: item.sk,
    createdAt: new Date(item.createdAt),
  };
};

export const getCognitoUser = captureAsync(
  "getCognitoUser",
  async (cognitoID: string): Promise<CognitoUser | undefined> => {
    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": cognitoID,
        ":sk": "usr_",
      },
      Limit: 1,
    });
    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return;
    return fromItem(Items[0]);
  },
);

type PutCognitoUser = Omit<CognitoUser, "createdAt" | "userID">;

export const ensureCognitoUser = captureAsync(
  "ensureCognitoUser",
  async ({ cognitoID }: PutCognitoUser): Promise<{ userID: UserID }> => {
    const cognitoUser = await getCognitoUser(cognitoID);
    if (cognitoUser) return { userID: cognitoUser.userID };

    const userID = genUserID();
    const cmd = new PutCommand({
      TableName,
      Item: {
        pk: cognitoID,
        sk: userID,
        createdAt: new Date().toISOString(),
      },
    });
    await documentClient().send(cmd);
    return { userID };
  },
);

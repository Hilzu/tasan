import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { type CognitoUserID, genUserID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  type CognitoUserItem,
  cognitoUserItemSchema,
  parseItem,
} from "../items.js";

export interface CognitoUser {
  cognitoID: CognitoUserID;
  userID: UserID;
  createdAt: Date;
}

const fromItem = (item: CognitoUserItem): CognitoUser => {
  return {
    cognitoID: item.pk,
    userID: item.sk,
    createdAt: new Date(item.createdAt),
  };
};

const toItem = (user: CognitoUser): CognitoUserItem => ({
  pk: user.cognitoID,
  sk: user.userID,
  createdAt: user.createdAt.toISOString(),
});

export const getCognitoUser = captureAsync(
  "getCognitoUser",
  async (cognitoID: CognitoUserID): Promise<CognitoUser | undefined> => {
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
    return fromItem(parseItem(cognitoUserItemSchema, Items[0], "cognito-user"));
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
      Item: toItem({ cognitoID, userID, createdAt: new Date() }),
    });
    await documentClient().send(cmd);
    return { userID };
  },
);

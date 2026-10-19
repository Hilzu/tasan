import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { type CognitoUserID, genUserID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { cognitoMappingClient } from "../client.js";
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
    userID: "userID" in item ? item.userID : item.sk,
    createdAt: new Date(item.createdAt),
  };
};

const toItem = (user: CognitoUser): CognitoUserItem => ({
  pk: user.cognitoID,
  sk: user.cognitoID,
  userID: user.userID,
  createdAt: user.createdAt.toISOString(),
});

export const getCognitoUser = captureAsync(
  "getCognitoUser",
  async (cognitoID: CognitoUserID): Promise<CognitoUser | undefined> => {
    const { Item } = await cognitoMappingClient().send(
      new GetCommand({
        TableName,
        Key: { pk: cognitoID, sk: cognitoID },
        ConsistentRead: true,
      }),
    );
    if (Item)
      return fromItem(parseItem(cognitoUserItemSchema, Item, "cognito-user"));

    // Read legacy mappings without changing their user IDs or rewriting them.
    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": cognitoID,
        ":sk": "usr_",
      },
      Limit: 1,
      ConsistentRead: true,
    });
    const { Items } = await cognitoMappingClient().send(cmd);
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
    const item = toItem({ cognitoID, userID, createdAt: new Date() });
    const cmd = new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          // Keep older application versions able to resolve newly created users.
          Put: {
            TableName,
            Item: { pk: cognitoID, sk: userID, createdAt: item.createdAt },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      ],
    });
    try {
      await cognitoMappingClient().send(cmd);
    } catch (error) {
      if (
        !(error instanceof TransactionCanceledException) ||
        error.CancellationReasons?.at(0)?.Code !== "ConditionalCheckFailed"
      )
        throw error;
      // A concurrent first login won. Return its ID, never the unused candidate.
      const winner = await getCognitoUser(cognitoID);
      if (!winner) throw error;
      return { userID: winner.userID };
    }
    return { userID };
  },
);

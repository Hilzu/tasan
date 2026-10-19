import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
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

const getCanonicalCognitoUser = async (
  cognitoID: CognitoUserID,
): Promise<CognitoUser | undefined> => {
  const { Item } = await cognitoMappingClient().send(
    new GetCommand({
      TableName,
      Key: { pk: cognitoID, sk: cognitoID },
      ConsistentRead: true,
    }),
  );
  return Item ?
      fromItem(parseItem(cognitoUserItemSchema, Item, "cognito-user"))
    : undefined;
};

/** Resolves an identity, upgrading legacy mappings without replacing an existing mapping. */
export const getCognitoUser = captureAsync(
  "getCognitoUser",
  async (cognitoID: CognitoUserID): Promise<CognitoUser | undefined> => {
    const existing = await getCanonicalCognitoUser(cognitoID);
    if (existing) return existing;

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
    // Another request may have migrated and removed the legacy record after our get.
    if (!Items?.length) return getCanonicalCognitoUser(cognitoID);
    const legacy = parseItem(cognitoUserItemSchema, Items[0], "cognito-user");
    const user = fromItem(legacy);
    try {
      await cognitoMappingClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName,
                Item: toItem(user),
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Delete: {
                TableName,
                Key: { pk: cognitoID, sk: user.userID },
                ConditionExpression: "createdAt = :createdAt",
                ExpressionAttributeValues: { ":createdAt": legacy.createdAt },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (
        !(error instanceof TransactionCanceledException) ||
        error.CancellationReasons?.at(0)?.Code !== "ConditionalCheckFailed"
      )
        throw error;
      const winner = await getCanonicalCognitoUser(cognitoID);
      if (!winner) throw error;
      return winner;
    }
    return user;
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
    const cmd = new PutCommand({
      TableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(pk)",
    });
    try {
      await cognitoMappingClient().send(cmd);
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      // A concurrent first login won. Return its ID, never the unused candidate.
      const winner = await getCognitoUser(cognitoID);
      if (!winner) throw error;
      return { userID: winner.userID };
    }
    return { userID };
  },
);

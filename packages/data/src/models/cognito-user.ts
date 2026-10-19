import { setTimeout } from "node:timers/promises";

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
  consistentRead = false,
): Promise<CognitoUser | undefined> => {
  const { Item } = await documentClient().send(
    new GetCommand({
      TableName,
      Key: { pk: cognitoID, sk: cognitoID },
      ConsistentRead: consistentRead,
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
    // Recover a stale miss below; existing mappings normally do not change.
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
      // A stale miss here could assign a new ID to an existing legacy user.
      ConsistentRead: true,
    });
    const { Items } = await documentClient().send(cmd);
    // Another request may have migrated and removed the legacy record after our get.
    if (!Items?.length) return getCanonicalCognitoUser(cognitoID, true);
    const legacy = parseItem(cognitoUserItemSchema, Items[0], "cognito-user");
    const user = fromItem(legacy);
    const maxRetries = 5;
    for (let attempt = 0; ; attempt++) {
      try {
        await documentClient().send(
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
        return user;
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) throw error;
        const reasons = error.CancellationReasons ?? [];
        const conditionFailed =
          reasons.at(0)?.Code === "ConditionalCheckFailed";
        const conflict =
          reasons.some(({ Code }) => Code === "TransactionConflict") &&
          reasons.every(
            ({ Code }) => Code === "None" || Code === "TransactionConflict",
          );
        if (!conditionFailed && !conflict) throw error;
        if (conflict && attempt < maxRetries)
          await setTimeout(Math.floor(Math.random() * 50 * 2 ** attempt));
        const winner = await getCanonicalCognitoUser(cognitoID, true);
        if (winner) return winner;
        if (!conflict || attempt === maxRetries) throw error;
      }
    }
  },
);

type PutCognitoUser = Omit<CognitoUser, "createdAt" | "userID">;

/** Conditional creation is local to this replica; simultaneous regional writes can race. */
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
      await documentClient().send(cmd);
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      // A concurrent first login won. Return its ID, never the unused candidate.
      const winner = await getCanonicalCognitoUser(cognitoID, true);
      if (!winner) throw error;
      return { userID: winner.userID };
    }
    return { userID };
  },
);

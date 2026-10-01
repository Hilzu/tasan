import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  genInviteID,
  type InviteID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";

export interface InviteForSplit {
  id: InviteID;
  splitID: SplitID;
  createdBy: UserID;
  expiresAt: Date;
}

export interface InviteSplitItem {
  pk: InviteID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
  expiresAt: number;
}

type PrimaryKey = Pick<InviteSplitItem, "pk" | "sk">;

export type CreateInviteForSplit = Omit<InviteForSplit, "id" | "expiresAt">;

export const createInviteForSplit = captureAsync(
  "createInviteForSplit",
  async ({
    splitID,
    createdBy,
  }: CreateInviteForSplit): Promise<{ id: InviteID }> => {
    const id = genInviteID();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const Item: InviteSplitItem = {
      pk: id,
      sk: splitID,
      createdAt: new Date().toISOString(),
      createdBy,
      expiresAt: toUnixTime(fiveDaysFromNow),
    };
    const cmd = new PutCommand({ TableName, Item });
    await documentClient().send(cmd);
    return { id };
  },
);

export const findInviteForSplit = captureAsync(
  "findInviteForSplit",
  async (inviteId: InviteID): Promise<InviteForSplit | undefined> => {
    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": inviteId,
        ":prefix": "spl_",
      },
    });
    const { Items } = await documentClient().send(cmd);
    if (!Items?.length) return;
    const [item] = Items as InviteSplitItem[];
    return {
      id: item.pk,
      splitID: item.sk,
      createdBy: item.createdBy,
      expiresAt: fromUnixTime(item.expiresAt),
    };
  },
);

// Consuming a single-use invitation and adding its member is one operation.
// The condition is checked at write time, including when two callers race.
export const consumeInviteForSplit = captureAsync(
  "consumeInviteForSplit",
  async (invite: InviteForSplit, userID: UserID): Promise<boolean> => {
    const now = new Date();
    const cmd = new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName,
            Key: { pk: invite.id, sk: invite.splitID } satisfies PrimaryKey,
            ConditionExpression: "attribute_exists(pk) AND expiresAt > :now",
            ExpressionAttributeValues: { ":now": toUnixTime(now) },
          },
        },
        {
          Update: {
            TableName,
            Key: { pk: invite.splitID, sk: userID },
            UpdateExpression:
              "SET createdAt = if_not_exists(createdAt, :createdAt), createdBy = if_not_exists(createdBy, :createdBy)",
            ExpressionAttributeValues: {
              ":createdAt": now.toISOString(),
              ":createdBy": invite.createdBy,
            },
          },
        },
      ],
    });
    try {
      await documentClient().send(cmd);
      return true;
    } catch (error) {
      if (
        error instanceof TransactionCanceledException &&
        error.CancellationReasons?.at(0)?.Code === "ConditionalCheckFailed"
      )
        return false;
      throw error;
    }
  },
);

export const deleteInviteForSplit = captureAsync(
  "deleteInviteForSplit",
  async (inviteID: InviteID, splitID: SplitID): Promise<void> => {
    const Key: PrimaryKey = { pk: inviteID, sk: splitID };
    const cmd = new DeleteCommand({ TableName, Key });
    await documentClient().send(cmd);
  },
);

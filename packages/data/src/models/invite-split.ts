import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  genInviteID,
  type InviteID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { toUnixTime } from "../date.js";

export interface InviteForSplit {
  id: InviteID;
  splitID: SplitID;
  createdBy: UserID;
}

export interface InviteSplitItem {
  pk: InviteID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
  expiresAt: number;
}

type PrimaryKey = Pick<InviteSplitItem, "pk" | "sk">;

export type CreateInviteForSplit = Omit<InviteForSplit, "id">;

export const createInviteForSplit = captureAsync(
  "createInviteForSplit",
  async ({
    splitID,
    createdBy,
  }: CreateInviteForSplit): Promise<{ id: string }> => {
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
    };
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

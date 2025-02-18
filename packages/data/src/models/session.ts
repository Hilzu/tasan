import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import {
  asValidSessionID,
  asValidUserID,
  genSessionID,
  type SessionID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../segment.js";

export interface Session {
  id: string;
  userID: string;
  expiresAt: Date;
}

interface SessionItem {
  pk: SessionID;
  sk: UserID;
  createdAt: string;
  expiresAt: number;
}

export const putSession = captureAsync(
  "putSession",
  async (session: Session): Promise<void> => {
    const Item: SessionItem = {
      pk: asValidSessionID(session.id),
      sk: asValidUserID(session.userID),
      createdAt: new Date().toISOString(),
      expiresAt: toUnixTime(session.expiresAt),
    };
    const cmd = new PutCommand({ TableName, Item });
    await documentClient.send(cmd);
  },
);

export type CreateSession = Omit<Session, "id">;

export const createSession = captureAsync(
  "createSession",
  async (session: CreateSession): Promise<{ id: string }> => {
    const id = genSessionID();
    await putSession({ ...session, id });
    return { id };
  },
);

export const findSession = captureAsync(
  "findSession",
  async (id: string): Promise<Session | undefined> => {
    const cmd = new QueryCommand({
      TableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": asValidSessionID(id),
      },
    });
    const { Items } = await documentClient.send(cmd);
    if (!Items?.length) return;
    const item = Items[0] as SessionItem;
    return {
      id: item.pk,
      userID: item.sk,
      expiresAt: fromUnixTime(item.expiresAt),
    };
  },
);

export const deleteSession = captureAsync(
  "deleteSession",
  async (id: string): Promise<void> => {
    const session = await findSession(id);
    if (!session) return;

    const deleteCmd = new DeleteCommand({
      TableName,
      Key: {
        pk: id,
        sk: session.userID,
      },
    });
    await documentClient.send(deleteCmd);
  },
);

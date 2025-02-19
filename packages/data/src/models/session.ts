import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import {
  assertValidSessionID,
  assertValidUserID,
  genSessionID,
  type SessionID,
  type UserID,
} from "../ids.js";
import { cachePromise } from "../promise.js";
import { captureAsync } from "../segment.js";

export interface Session {
  id: string;
  userID: string;
  expiresAt: Date;
}

interface SessionItem {
  pk: SessionID;
  sk: SessionID;
  createdAt: string;
  expiresAt: number;
  forUser: UserID;
}

type PrimaryKey = Pick<SessionItem, "pk" | "sk">;

export const putSession = captureAsync(
  "putSession",
  async (session: Session): Promise<void> => {
    assertValidSessionID(session.id);
    assertValidUserID(session.userID);
    const Item: SessionItem = {
      pk: session.id,
      sk: session.id,
      createdAt: new Date().toISOString(),
      expiresAt: toUnixTime(session.expiresAt),
      forUser: session.userID,
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

export const getSession = captureAsync(
  "getSession",
  cachePromise(async (id: string): Promise<Session | undefined> => {
    assertValidSessionID(id);
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({
      TableName,
      Key,
    });
    const { Item } = await documentClient.send(cmd);
    if (!Item) return;
    const item = Item as SessionItem;
    return {
      id: item.pk,
      userID: item.forUser,
      expiresAt: fromUnixTime(item.expiresAt),
    };
  }),
);

export const deleteSession = captureAsync(
  "deleteSession",
  async (id: string): Promise<void> => {
    assertValidSessionID(id);
    const Key: PrimaryKey = { pk: id, sk: id };
    const deleteCmd = new DeleteCommand({
      TableName,
      Key,
    });
    await documentClient.send(deleteCmd);
  },
);

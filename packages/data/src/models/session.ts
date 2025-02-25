import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import {
  assertValidSessionID,
  asValidUserID,
  genSessionID,
  type SessionID,
  type UserID,
} from "../ids.js";
import { memoizeSingleFlight } from "../promise.js";
import { captureAsync } from "../tracing.js";

export interface Session {
  id: string;
  userID?: string;
  expiresAt: Date;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface SessionItem {
  pk: SessionID;
  sk: SessionID;
  createdAt: string;
  expiresAt: number;
  forUser?: UserID;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
  accessToken?: string;
  refreshToken?: string;
}

type PrimaryKey = Pick<SessionItem, "pk" | "sk">;

export const putSession = captureAsync(
  "putSession",
  async (session: Session): Promise<void> => {
    assertValidSessionID(session.id);
    const Item: SessionItem = {
      pk: session.id,
      sk: session.id,
      createdAt: new Date().toISOString(),
      expiresAt: toUnixTime(session.expiresAt),
      forUser: session.userID ? asValidUserID(session.userID) : undefined,
      authState: session.authState,
      authNonce: session.authNonce,
      authRedirect: session.authRedirect,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
    const cmd = new PutCommand({ TableName, Item });
    await documentClient().send(cmd);
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
  memoizeSingleFlight(async (id: string): Promise<Session | undefined> => {
    assertValidSessionID(id);
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({
      TableName,
      Key,
    });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    const item = Item as SessionItem;
    return {
      id: item.pk,
      userID: item.forUser,
      expiresAt: fromUnixTime(item.expiresAt),
      authState: item.authState,
      authNonce: item.authNonce,
      authRedirect: item.authRedirect,
      accessToken: item.accessToken,
      refreshToken: item.refreshToken,
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
    await documentClient().send(deleteCmd);
  },
);

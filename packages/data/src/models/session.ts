import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { genSessionID, type SessionID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import { memoizeSingleFlight } from "../promise.js";

export interface Session {
  id: SessionID;
  userID?: UserID;
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
    const Item: SessionItem = {
      pk: session.id,
      sk: session.id,
      createdAt: new Date().toISOString(),
      expiresAt: toUnixTime(session.expiresAt),
      forUser: session.userID,
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
  async (session: CreateSession): Promise<{ id: SessionID }> => {
    const id = genSessionID();
    await putSession({ ...session, id });
    return { id };
  },
);

export const getSession = captureAsync(
  "getSession",
  memoizeSingleFlight(async (id: SessionID): Promise<Session | undefined> => {
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
  async (id: SessionID): Promise<void> => {
    const Key: PrimaryKey = { pk: id, sk: id };
    const deleteCmd = new DeleteCommand({
      TableName,
      Key,
    });
    await documentClient().send(deleteCmd);
  },
);

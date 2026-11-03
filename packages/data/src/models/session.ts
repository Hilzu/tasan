import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { genSessionID, type SessionID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import { parseItem, type SessionItem, sessionItemSchema } from "../items.js";

export interface Session {
  id: SessionID;
  userID?: UserID;
  /** Current expiry; activity may extend it up to absoluteExpiresAt. */
  expiresAt: Date;
  /** Fixed deadline set at sign-in; activity cannot extend it. */
  absoluteExpiresAt?: Date;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
  accessToken?: string;
  refreshToken?: string;
}

type PrimaryKey = Pick<SessionItem, "pk" | "sk">;

const toItem = (session: Session): SessionItem => ({
  pk: session.id,
  sk: session.id,
  createdAt: new Date().toISOString(),
  expiresAt: toUnixTime(session.expiresAt),
  absoluteExpiresAt:
    session.absoluteExpiresAt && toUnixTime(session.absoluteExpiresAt),
  forUser: session.userID,
  authState: session.authState,
  authNonce: session.authNonce,
  authRedirect: session.authRedirect,
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
});

const fromItem = (item: SessionItem): Session => ({
  id: item.pk,
  userID: item.forUser,
  expiresAt: fromUnixTime(item.expiresAt),
  absoluteExpiresAt:
    item.absoluteExpiresAt === undefined ?
      undefined
    : fromUnixTime(item.absoluteExpiresAt),
  authState: item.authState,
  authNonce: item.authNonce,
  authRedirect: item.authRedirect,
  accessToken: item.accessToken,
  refreshToken: item.refreshToken,
});

export const putSession = captureAsync(
  "putSession",
  async (session: Session): Promise<void> => {
    const Item = toItem(session);
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
  async (id: SessionID): Promise<Session | undefined> => {
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({
      TableName,
      Key,
      ConsistentRead: true,
    });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    const item = parseItem(sessionItemSchema, Item, "session");
    // DynamoDB TTL deletion is asynchronous; retained records are not valid sessions.
    const now = toUnixTime(new Date());
    if (
      item.expiresAt <= now ||
      (item.absoluteExpiresAt !== undefined && item.absoluteExpiresAt <= now)
    )
      return;
    return fromItem(item);
  },
);

/** Refresh only a live record, without overwriting auth data or resurrecting logout. */
export const refreshSession = captureAsync(
  "refreshSession",
  async (
    id: SessionID,
    expiresAt: Date,
    previousExpiresAt: Date,
  ): Promise<boolean> => {
    const expiry = toUnixTime(expiresAt);
    const now = toUnixTime(new Date());
    if (expiry <= now) return false;
    try {
      await documentClient().send(
        new UpdateCommand({
          TableName,
          Key: { pk: id, sk: id } satisfies PrimaryKey,
          UpdateExpression: "SET expiresAt = :expiry",
          ConditionExpression:
            "attribute_exists(pk) AND expiresAt > :now AND expiresAt = :previousExpiry AND expiresAt < :expiry AND (attribute_not_exists(absoluteExpiresAt) OR absoluteExpiresAt >= :expiry)",
          ExpressionAttributeValues: {
            ":now": now,
            ":expiry": expiry,
            ":previousExpiry": toUnixTime(previousExpiresAt),
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  },
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

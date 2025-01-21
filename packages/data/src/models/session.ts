import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { fromUnixTime, toUnixTime } from "../date.js";
import { genSessionId } from "../ids.js";

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

interface SessionItem {
  pk: string;
  sk: string;
  createdAt: string;
  expiresAt: number;
}

export const putSession = async (session: Session): Promise<void> => {
  const cmd = new PutCommand({
    TableName,
    Item: {
      pk: session.id,
      sk: session.userId,
      createdAt: new Date().toISOString(),
      expiresAt: toUnixTime(session.expiresAt),
    } satisfies SessionItem,
  });
  await documentClient.send(cmd);
};

export type CreateSession = Omit<Session, "id">;

export const createSession = async (
  session: CreateSession,
): Promise<{ id: string }> => {
  const id = genSessionId();
  await putSession({ ...session, id });
  return { id };
};

export const readSession = async (id: string): Promise<Session | undefined> => {
  const cmd = new QueryCommand({
    TableName,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": id,
    },
  });
  const { Items } = await documentClient.send(cmd);
  if (!Items?.length) return;
  const item = Items[0] as SessionItem;
  return {
    id: item.pk,
    userId: item.sk,
    expiresAt: fromUnixTime(item.expiresAt),
  };
};

export const deleteSession = async (id: string): Promise<void> => {
  const session = await readSession(id);
  if (!session) return;

  const deleteCmd = new DeleteCommand({
    TableName,
    Key: {
      pk: id,
      sk: session.userId,
    },
  });
  await documentClient.send(deleteCmd);
};

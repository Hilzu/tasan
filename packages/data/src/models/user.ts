import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { assertValidUserId, genUserId } from "../ids.js";

export interface User {
  id: string;
  name: string;
}

interface UserItem {
  pk: string;
  sk: string;
  name: string;
  createdAt: string;
}

export type CreateUser = Omit<User, "id">;

export const createUser = async (user: CreateUser): Promise<{ id: string }> => {
  const id = genUserId();
  const cmd = new PutCommand({
    TableName,
    Item: {
      pk: id,
      sk: id,
      createdAt: new Date().toISOString(),
      name: user.name,
    } satisfies UserItem,
  });
  await documentClient.send(cmd);
  return { id };
};

export const getUser = async (id: string): Promise<User | undefined> => {
  assertValidUserId(id);
  const cmd = new GetCommand({
    TableName,
    Key: {
      pk: id,
      sk: id,
    },
  });
  const { Item } = await documentClient.send(cmd);
  if (!Item) return;
  const item = Item as UserItem;
  return {
    id: item.pk,
    name: item.name,
  };
};

import { BatchGetCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidUserID,
  asValidUserID,
  genUserID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../tracing.js";

export interface User {
  id: string;
  name: string;
  email: string;
}

interface UserItem {
  pk: UserID;
  sk: UserID;
  name: string;
  createdAt: string;
  email: string;
}

type PrimaryKey = Pick<UserItem, "pk" | "sk">;

const fromItem = (Item: Record<string, unknown>): User => {
  const item = Item as unknown as UserItem;
  return {
    id: item.pk,
    name: item.name,
    email: item.email,
  };
};

export const putUser = captureAsync(
  "putUser",
  async (user: User): Promise<void> => {
    assertValidUserID(user.id);
    const Item: UserItem = {
      pk: user.id,
      sk: user.id,
      name: user.name,
      createdAt: new Date().toISOString(),
      email: user.email,
    };
    const cmd = new PutCommand({ TableName, Item });
    await documentClient().send(cmd);
  },
);

export type CreateUser = Omit<User, "id">;
export const createUser = captureAsync(
  "createUser",
  async (user: CreateUser): Promise<{ id: string }> => {
    const id = genUserID();
    await putUser({ ...user, id });
    return { id };
  },
);

export const getUser = captureAsync(
  "getUser",
  async (id: string): Promise<User | undefined> => {
    assertValidUserID(id);
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    return fromItem(Item);
  },
);

export const getUsers = captureAsync(
  "getUsers",
  async (idSet: Set<string>): Promise<User[]> => {
    const pks = Array.from(idSet, (id) => {
      const userId = asValidUserID(id);
      return { pk: userId, sk: userId } satisfies PrimaryKey;
    });
    if (!pks.length) return [];
    const cmd = new BatchGetCommand({
      RequestItems: {
        [TableName]: {
          Keys: pks,
        },
      },
    });
    const { Responses } = await documentClient().send(cmd);
    const items = Responses?.[TableName];
    if (!items?.length) return [];
    return items.map(fromItem);
  },
);

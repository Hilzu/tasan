import { BatchGetCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidUserID,
  asValidUserID,
  genUserID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../segment.js";

export interface User {
  id: string;
  name: string;
}

interface UserItem {
  pk: UserID;
  sk: UserID;
  name: string;
  createdAt: string;
}

type PrimaryKey = Pick<UserItem, "pk" | "sk">;

export type CreateUser = Omit<User, "id">;

export const createUser = captureAsync(
  "createUser",
  async (user: CreateUser): Promise<{ id: string }> => {
    const id = genUserID();
    const Item: UserItem = {
      pk: id,
      sk: id,
      createdAt: new Date().toISOString(),
      name: user.name,
    };
    const cmd = new PutCommand({ TableName, Item });
    await documentClient.send(cmd);
    return { id };
  },
);

export const getUser = captureAsync(
  "getUser",
  async (id: string): Promise<User | undefined> => {
    assertValidUserID(id);
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient.send(cmd);
    if (!Item) return;
    const item = Item as UserItem;
    return {
      id: item.pk,
      name: item.name,
    };
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
    const { Responses } = await documentClient.send(cmd);
    const items = Responses?.[TableName];
    if (!items?.length) return [];
    return items.map((item_) => {
      const item = item_ as UserItem;
      return {
        id: item.pk,
        name: item.name,
      };
    });
  },
);

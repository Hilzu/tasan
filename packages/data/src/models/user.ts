import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { batchGetItems } from "../batch-get.js";
import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import { parseItem, type UserItem, userItemSchema } from "../items.js";

export interface User {
  id: UserID;
  name: string;
  email: string;
}

type PrimaryKey = Pick<UserItem, "pk" | "sk">;

const fromItem = (item: UserItem): User => {
  return {
    id: item.pk,
    name: item.name,
    email: item.email,
  };
};

const toItem = (user: User): UserItem => ({
  pk: user.id,
  sk: user.id,
  name: user.name,
  createdAt: new Date().toISOString(),
  email: user.email,
});

export const putUser = captureAsync(
  "putUser",
  async (user: User): Promise<void> => {
    const item = toItem(user);
    const Key: PrimaryKey = { pk: item.pk, sk: item.sk };
    const cmd = new UpdateCommand({
      TableName,
      Key,
      UpdateExpression:
        "SET #name = :name, email = :email, createdAt = if_not_exists(createdAt, :now)",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: {
        ":name": item.name,
        ":email": item.email,
        ":now": item.createdAt,
      },
    });
    await documentClient().send(cmd);
  },
);

export const getUser = captureAsync(
  "getUser",
  async (id: UserID): Promise<User | undefined> => {
    const Key: PrimaryKey = { pk: id, sk: id };
    const cmd = new GetCommand({ TableName, Key });
    const { Item } = await documentClient().send(cmd);
    if (!Item) return;
    return fromItem(parseItem(userItemSchema, Item, "user"));
  },
);

export const getUsers = captureAsync(
  "getUsers",
  async (idSet: Set<UserID>): Promise<User[]> => {
    const pks = Array.from(idSet, (id) => {
      return { pk: id, sk: id } satisfies PrimaryKey;
    });
    const items = await batchGetItems(pks);
    return items.map((item) =>
      fromItem(parseItem(userItemSchema, item, "user")),
    );
  },
);

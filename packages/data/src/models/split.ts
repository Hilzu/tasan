import {
  GetCommand,
  paginateQuery,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { compareById } from "@tasan/common/compare";
import type { CurrencySymbol } from "@tasan/common/currency";
import { genSplitID, type SplitID, type UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { batchGetItems } from "../batch-get.js";
import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  parseItem,
  type SplitItem,
  splitItemSchema,
  splitUserItemSchema,
} from "../items.js";
import { expensesFromItems, type SplitExpense } from "./split-expense.js";
import { findUserSplitIDs, toItem as splitUserToItem } from "./split-user.js";

export interface Split {
  id: SplitID;
  name: string;
  createdBy: UserID;
  createdAt: Date;
  currency: CurrencySymbol;
}

type PrimaryKey = Pick<SplitItem, "pk" | "sk">;

const fromItem = (item: SplitItem): Split => {
  return {
    id: item.pk,
    name: item.name,
    createdBy: item.createdBy,
    currency: item.currency,
    createdAt: new Date(item.createdAt),
  };
};

const toItem = (split: Split): SplitItem => ({
  pk: split.id,
  sk: split.id,
  name: split.name,
  currency: split.currency,
  createdBy: split.createdBy,
  createdAt: split.createdAt.toISOString(),
});

export type CreateSplit = Omit<Split, "id" | "createdAt">;

/** Creates the split and its owner membership in a single transaction. */
export const createSplit = captureAsync(
  "createSplit",
  async (split: CreateSplit): Promise<{ id: SplitID }> => {
    const id = genSplitID();
    const Item = toItem({ ...split, id, createdAt: new Date() });
    const cmd = new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName, Item } },
        {
          Put: {
            TableName,
            Item: splitUserToItem(
              {
                splitID: id,
                userID: split.createdBy,
                createdBy: split.createdBy,
              },
              Item.createdAt,
            ),
          },
        },
      ],
    });
    await documentClient().send(cmd);

    return { id };
  },
);

/** Reads only split metadata, without loading expenses or memberships. */
export const getSplit = captureAsync(
  "getSplit",
  async (splitID: SplitID): Promise<Split | undefined> => {
    const Key: PrimaryKey = { pk: splitID, sk: splitID };
    const { Item } = await documentClient().send(
      new GetCommand({ TableName, Key, ConsistentRead: true }),
    );
    return Item ?
        fromItem(parseItem(splitItemSchema, Item, "split"))
      : undefined;
  },
);

export const findUsersSplits = captureAsync(
  "findUsersSplits",
  async (userID: UserID): Promise<Split[]> => {
    const splitIDs = await findUserSplitIDs(userID);
    if (!splitIDs.length) return [];

    const Keys: PrimaryKey[] = splitIDs.map((splitID) => ({
      pk: splitID,
      sk: splitID,
    }));
    const Items = await batchGetItems(Keys);

    return Items.map((item) =>
      fromItem(parseItem(splitItemSchema, item, "split")),
    )
      .sort(compareById)
      .reverse();
  },
);

export type SplitWithData = Split & {
  userIDs: Set<UserID>;
  expenses: SplitExpense[];
};

/** Loads the split with its member IDs and non-deleted expenses. */
export const getSplitWithData = captureAsync(
  "getSplitWithData",
  async (splitID: SplitID): Promise<SplitWithData | undefined> => {
    const paginator = paginateQuery(
      { client: documentClient() },
      {
        TableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": splitID },
      },
    );
    const Items: Record<string, unknown>[] = [];
    for await (const page of paginator) {
      if (!page.Items?.length) continue;
      Items.push(...page.Items);
    }
    if (!Items.length) return;

    let split: Split | undefined;
    const userIDs = new Set<UserID>();
    const expenseItems: Record<string, unknown>[] = [];
    for (const Item of Items) {
      if (typeof Item.sk !== "string") continue;
      if (Item.sk === splitID && !Item.deletedAt)
        split = fromItem(parseItem(splitItemSchema, Item, "split"));
      else if (Item.sk.startsWith("usr_") && !Item.deletedAt)
        userIDs.add(parseItem(splitUserItemSchema, Item, "split-user").sk);
      else if (Item.sk.startsWith("exp_")) expenseItems.push(Item);
    }
    const expenses = expensesFromItems(expenseItems)
      .sort(compareById)
      .reverse();

    return split ? { ...split, userIDs, expenses } : undefined;
  },
);

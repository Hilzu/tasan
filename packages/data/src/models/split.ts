import {
  BatchGetCommand,
  paginateQuery,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { compareById } from "@tasan/common/compare";
import type { CurrencySymbol } from "@tasan/common/currency";
import {
  asUserID,
  genSplitID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  fromItem as fromExpenseItem,
  type SplitExpense,
} from "./split-expense.js";
import { createSplitUser, findUserSplitIDs } from "./split-user.js";

export interface Split {
  id: SplitID;
  name: string;
  createdBy: UserID;
  createdAt: Date;
  currency: CurrencySymbol;
}

interface SplitItem {
  pk: SplitID;
  sk: SplitID;
  createdAt: string;
  createdBy: UserID;
  name: string;
  currency: CurrencySymbol;
}

type PrimaryKey = Pick<SplitItem, "pk" | "sk">;

const fromItem = (Item: Record<string, unknown>): Split => {
  const item = Item as unknown as SplitItem;
  return {
    id: item.pk,
    name: item.name,
    createdBy: item.createdBy,
    currency: item.currency,
    createdAt: new Date(item.createdAt),
  };
};

export type CreateSplit = Omit<Split, "id" | "users" | "createdAt">;

export const createSplit = captureAsync(
  "createSplit",
  async (split: CreateSplit): Promise<{ id: SplitID }> => {
    const id = genSplitID();
    const Item: SplitItem = {
      pk: id,
      sk: id,
      createdAt: new Date().toISOString(),
      createdBy: split.createdBy,
      name: split.name,
      currency: split.currency,
    };
    const cmd = new PutCommand({ TableName, Item });

    const splitUserPromise = createSplitUser({
      userID: split.createdBy,
      splitID: id,
      createdBy: split.createdBy,
    });

    await Promise.all([documentClient().send(cmd), splitUserPromise]);

    return { id };
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
    const cmd = new BatchGetCommand({
      RequestItems: { [TableName]: { Keys } },
    });
    const { Responses } = await documentClient().send(cmd);

    const Items = Responses?.[TableName];
    if (!Items?.length) return [];

    return Items.map(fromItem).sort(compareById).reverse();
  },
);

export type SplitWithData = Split & {
  userIDs: Set<UserID>;
  expenses: SplitExpense[];
};

export const getSplitWithData = captureAsync(
  "getSplitWithData",
  async (splitID: SplitID): Promise<SplitWithData | undefined> => {
    const paginator = paginateQuery(
      { client: documentClient() },
      {
        TableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": splitID },
        FilterExpression: "attribute_not_exists(deletedAt)",
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
    const expenses: SplitExpense[] = [];
    for (const Item of Items) {
      if (typeof Item.sk !== "string") continue;
      if (Item.sk === splitID) split = fromItem(Item);
      else if (Item.sk.startsWith("usr_")) userIDs.add(asUserID(Item.sk));
      else if (Item.sk.startsWith("exp_")) expenses.push(fromExpenseItem(Item));
    }
    expenses.reverse();

    return split ? { ...split, userIDs, expenses } : undefined;
  },
);

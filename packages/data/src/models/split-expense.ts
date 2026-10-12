import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { compareByKey } from "@tasan/common/compare";
import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { ExpenseID, SplitID, UserID } from "@tasan/common/id";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";

export interface SplitExpense {
  id: ExpenseID;
  splitID: SplitID;
  name: string;
  amount: D.Decimal;
  createdBy: UserID;
  createdAt: Date;
  currency: CurrencySymbol;
  conversionRate?: number;
  payer: UserID;
  participants: Map<UserID, D.Decimal>;
}

interface SplitExpenseItem {
  pk: SplitID;
  sk: ExpenseID;
  name: string;
  createdAt: string;
  createdBy: UserID;
  amount: number;
  currency: CurrencySymbol;
  conversionRate?: number;
  payer: UserID;
  participants: Record<UserID, number>;
  creationRequestHash?: string;
  deletedAt?: string;
  deletedBy?: string;
}

type PrimaryKey = Pick<SplitExpenseItem, "pk" | "sk">;

export const fromItem = (Item: Record<string, unknown>): SplitExpense => {
  const item = Item as unknown as SplitExpenseItem;
  const fractionDigits = currencies[item.currency].fractions;
  const participants = new Map(
    Object.entries(item.participants)
      .sort(compareByKey)
      .map(([k, v]) => [k as UserID, D.create(v, fractionDigits)]),
  );
  return {
    id: item.sk,
    splitID: item.pk,
    name: item.name,
    amount: D.create(item.amount, fractionDigits),
    createdBy: item.createdBy,
    createdAt: new Date(item.createdAt),
    currency: item.currency,
    conversionRate: item.conversionRate,
    payer: item.payer,
    participants,
  };
};

export class ExpenseIDConflictError extends Error {
  constructor() {
    super("This expense ID has already been used for another submission.");
    this.name = "ExpenseIDConflictError";
  }
}

// Read the immutable creation fingerprint, even for a soft-deleted expense.
export const findExpenseCreation = async (
  splitID: SplitID,
  id: ExpenseID,
  actorID: UserID,
  requestHash: string,
): Promise<{ id: ExpenseID } | undefined> => {
  const item = await getSplitExpenseItem(splitID, id);
  if (!item) return undefined;
  if (item.createdBy !== actorID || item.creationRequestHash !== requestHash)
    throw new ExpenseIDConflictError();
  return { id };
};

export type CreateSplitExpense = Omit<SplitExpense, "createdAt"> & {
  creationRequestHash: string;
};

export const createSplitExpense = captureAsync(
  "createSplitExpense",
  async (expense: CreateSplitExpense): Promise<{ id: ExpenseID }> => {
    const { id } = expense;
    const Item: SplitExpenseItem = {
      pk: expense.splitID,
      sk: id,
      createdAt: new Date().toISOString(),
      createdBy: expense.createdBy,
      creationRequestHash: expense.creationRequestHash,
      amount: expense.amount.value,
      name: expense.name,
      currency: expense.currency,
      conversionRate: expense.conversionRate,
      payer: expense.payer,
      participants: Object.fromEntries(
        [...expense.participants].map(([k, v]) => [k, v.value]),
      ),
    };
    const cmd = new PutCommand({
      TableName,
      Item,
      ConditionExpression: "attribute_not_exists(pk)",
    });

    try {
      await documentClient().send(cmd);
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await findExpenseCreation(
        expense.splitID,
        id,
        expense.createdBy,
        expense.creationRequestHash,
      );
      if (!existing) throw error;
      return existing;
    }
    return { id };
  },
);

const getSplitExpenseItem = captureAsync(
  "getSplitExpenseItem",
  async (
    splitID: SplitID,
    expenseID: ExpenseID,
  ): Promise<SplitExpenseItem | undefined> => {
    const Key: PrimaryKey = { pk: splitID, sk: expenseID };
    const cmd = new GetCommand({ TableName, Key, ConsistentRead: true });
    const { Item } = await documentClient().send(cmd);
    return Item as SplitExpenseItem | undefined;
  },
);

export const deleteSplitExpense = captureAsync(
  "deleteSplitExpense",
  async (
    splitID: SplitID,
    expenseID: ExpenseID,
    userID: UserID,
  ): Promise<void> => {
    const Item = await getSplitExpenseItem(splitID, expenseID);
    if (!Item) throw new Error("Split expense not found");
    Item.deletedAt = new Date().toISOString();
    Item.deletedBy = userID;
    const cmd = new PutCommand({ TableName, Item });
    await documentClient().send(cmd);
  },
);

import { PutCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";
import {
  assertValidSplitID,
  assertValidUserID,
  type ExpenseID,
  genExpenseID,
  type SplitID,
  type UserID,
} from "../ids.js";
import { captureAsync } from "../tracing.js";

export interface SplitExpense {
  id: string;
  splitID: string;
  name: string;
  amount: number;
  createdBy: string;
  currency: string;
  payer: string;
  participants: Record<string, number>;
}

interface SplitExpenseItem {
  pk: SplitID;
  sk: ExpenseID;
  name: string;
  createdAt: string;
  createdBy: UserID;
  amount: number;
  currency: string;
  payer: UserID;
  participants: Record<UserID, number>;
}

// type PrimaryKey = Pick<SplitExpenseItem, "pk" | "sk">;

export const fromItem = (Item: Record<string, unknown>): SplitExpense => {
  const item = Item as unknown as SplitExpenseItem;
  return {
    id: item.sk,
    splitID: item.pk,
    name: item.name,
    amount: item.amount,
    createdBy: item.createdBy,
    currency: item.currency,
    payer: item.payer,
    participants: item.participants,
  };
};

export type CreateSplitExpense = Omit<SplitExpense, "id">;

export const createSplitExpense = captureAsync(
  "createSplitExpense",
  async (expense: CreateSplitExpense): Promise<{ id: string }> => {
    console.log("createSplitExpense", expense);
    assertValidUserID(expense.createdBy);
    assertValidUserID(expense.payer);
    assertValidSplitID(expense.splitID);
    for (const userID of Object.keys(expense.participants)) {
      assertValidUserID(userID);
    }
    const id = genExpenseID();
    const Item: SplitExpenseItem = {
      pk: expense.splitID,
      sk: id,
      createdAt: new Date().toISOString(),
      createdBy: expense.createdBy,
      amount: expense.amount,
      name: expense.name,
      currency: expense.currency,
      payer: expense.payer,
      participants: expense.participants as Record<UserID, number>,
    };
    const cmd = new PutCommand({ TableName, Item });

    await documentClient().send(cmd);
    return { id };
  },
);

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as Decimal from "@tasan/common/decimal";
import {
  type ExpenseID,
  genExpenseID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import { mapObjectValues } from "@tasan/common/object";
import { captureAsync } from "@tasan/common/tracing";

import { documentClient } from "../client.js";
import { TableName } from "../config.js";

export interface SplitExpense {
  id: ExpenseID;
  splitID: SplitID;
  name: string;
  amount: Decimal.Decimal;
  createdBy: UserID;
  createdAt: Date;
  currency: CurrencySymbol;
  conversionRate?: number;
  payer: UserID;
  participants: Record<UserID, Decimal.Decimal>;
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
}

// type PrimaryKey = Pick<SplitExpenseItem, "pk" | "sk">;

export const fromItem = (Item: Record<string, unknown>): SplitExpense => {
  const item = Item as unknown as SplitExpenseItem;
  const fractionDigits = currencies[item.currency].fractions;
  return {
    id: item.sk,
    splitID: item.pk,
    name: item.name,
    amount: Decimal.create(item.amount, fractionDigits),
    createdBy: item.createdBy,
    createdAt: new Date(item.createdAt),
    currency: item.currency,
    conversionRate: item.conversionRate,
    payer: item.payer,
    participants: mapObjectValues(item.participants, (v) =>
      Decimal.create(v, fractionDigits),
    ),
  };
};

export type CreateSplitExpense = Omit<SplitExpense, "id" | "createdAt">;

export const createSplitExpense = captureAsync(
  "createSplitExpense",
  async (expense: CreateSplitExpense): Promise<{ id: string }> => {
    const id = genExpenseID();
    const Item: SplitExpenseItem = {
      pk: expense.splitID,
      sk: id,
      createdAt: new Date().toISOString(),
      createdBy: expense.createdBy,
      amount: expense.amount.value,
      name: expense.name,
      currency: expense.currency,
      conversionRate: expense.conversionRate,
      payer: expense.payer,
      participants: mapObjectValues(expense.participants, (v) => v.value),
    };
    const cmd = new PutCommand({ TableName, Item });

    await documentClient().send(cmd);
    return { id };
  },
);

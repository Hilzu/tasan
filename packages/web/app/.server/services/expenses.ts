import type { CurrencySymbol } from "@tasan/common/currency";
import { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import * as D from "@tasan/common/decimal";
import {
  asExpenseID,
  type ExpenseID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import {
  createSplitExpense,
  deleteSplitExpense,
  ExpenseIDConflictError,
  findExpenseCreation,
  findSplitUsers,
} from "@tasan/data";

import { ApplicationError } from "./errors";
import { requireMembership, requireSplit } from "./splits";
import {
  invalidField,
  toAmount,
  validateCurrency,
  validateName,
} from "./validation";

export interface NewExpense {
  id: ExpenseID;
  name: string;
  currency: CurrencySymbol;
  amount: number;
  payer: UserID;
  participants: Map<UserID, number>;
}

export const createExpense = async (
  actorID: UserID,
  splitID: SplitID,
  input: NewExpense,
) => {
  await requireMembership(actorID, splitID);
  try {
    asExpenseID(input.id);
  } catch {
    invalidField("id", "Invalid expense ID.");
  }
  try {
    const existing = await findExpenseCreation(splitID, input.id, actorID);
    if (existing) return existing;
  } catch (error) {
    if (error instanceof ExpenseIDConflictError)
      throw new ApplicationError("conflict", error.message);
    throw error;
  }
  const split = await requireSplit(splitID);
  validateName(input.name);
  validateCurrency(input.currency);
  const amount = toAmount(input.amount, input.currency, "amount");
  const members = new Set(
    (await findSplitUsers(splitID)).map((user) => user.userID),
  );
  if (!members.has(input.payer))
    invalidField("payer", "Payer must be in the split.");
  if (input.participants.size === 0)
    invalidField("participants", "Participants are required.");
  const participants = new Map<UserID, D.Decimal>();
  for (const [userID, value] of input.participants) {
    if (!members.has(userID))
      invalidField("participants", "Participants must be in the split.");
    participants.set(userID, toAmount(value, input.currency, "participants"));
  }
  const total = [...participants.values()].reduce(
    (sum, share) => D.add(sum, share),
    D.create(0, amount.fractions),
  );
  if (!D.equals(total, amount))
    invalidField("participants", "Total amount must match the expense amount.");
  const conversionRate =
    input.currency === split.currency ?
      undefined
    : await fetchCurrencyConversionRate(input.currency, split.currency);
  if (
    conversionRate !== undefined &&
    (!Number.isFinite(conversionRate) || conversionRate <= 0)
  )
    throw new Error("Invalid exchange rate from currency provider");
  try {
    return await createSplitExpense({
      id: input.id,
      splitID,
      name: input.name,
      currency: input.currency,
      amount,
      payer: input.payer,
      participants,
      conversionRate,
      createdBy: actorID,
    });
  } catch (error) {
    if (error instanceof ExpenseIDConflictError)
      throw new ApplicationError("conflict", error.message);
    throw error;
  }
};

export const deleteExpense = async (
  actorID: UserID,
  splitID: SplitID,
  expenseID: ExpenseID,
) => {
  await requireMembership(actorID, splitID);
  await deleteSplitExpense(splitID, expenseID, actorID);
};

import type { CurrencySymbol } from "@tasan/common/currency";
import { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import * as D from "@tasan/common/decimal";
import {
  asExpenseID,
  asOperationID,
  type ExpenseID,
  type SplitID,
  type UserID,
} from "@tasan/common/id";
import { getLogger } from "@tasan/common/logging";
import {
  createSplitExpense,
  deleteSplitExpense,
  editSplitExpense,
  ExpenseConflictError,
  ExpenseIDConflictError,
  ExpenseNotFoundError,
  type ExpenseOperation,
  findExpenseCreation,
  findExpenseRevisions,
  findSplitUsers,
  getSplitExpense,
} from "@tasan/data";

import { ApplicationError } from "./errors";
import { logAction } from "./logging";
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
  return logAction(
    "expense.create",
    {
      userId: actorID,
      splitId: splitID,
      expenseId: input.id,
      parameters: {
        currency: input.currency,
        amount: input.amount,
        payer: input.payer,
        participants: Object.fromEntries(input.participants),
      },
    },
    async () => {
      await requireMembership(actorID, splitID);
      try {
        asExpenseID(input.id);
      } catch {
        invalidField("id", "Invalid expense ID.");
      }
      try {
        const existing = await findExpenseCreation(splitID, input.id, actorID);
        if (existing) {
          getLogger().appendKeys({ deduplicated: true });
          return existing;
        }
      } catch (error) {
        if (
          error instanceof ExpenseIDConflictError ||
          error instanceof ExpenseConflictError
        )
          throw new ApplicationError("conflict", error.message);
        throw error;
      }
      const [split, splitUsers] = await Promise.all([
        requireSplit(splitID),
        findSplitUsers(splitID),
      ]);
      const { amount, participants } = validateExpense(input, splitUsers);
      const conversionRate =
        input.currency === split.currency ?
          undefined
        : await fetchCurrencyConversionRate(input.currency, split.currency);
      if (
        conversionRate !== undefined &&
        (!Number.isFinite(conversionRate) || conversionRate <= 0)
      )
        throw new Error("Invalid exchange rate from currency provider");
      getLogger().appendKeys({ conversionRate });
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
        if (
          error instanceof ExpenseIDConflictError ||
          error instanceof ExpenseConflictError
        )
          throw new ApplicationError("conflict", error.message);
        throw error;
      }
    },
  );
};

const validateExpense = (
  input: Omit<NewExpense, "id">,
  splitUsers: Awaited<ReturnType<typeof findSplitUsers>>,
) => {
  validateName(input.name);
  validateCurrency(input.currency);
  const amount = toAmount(input.amount, input.currency, "amount");
  const members = new Set(splitUsers.map((user) => user.userID));
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
  return { amount, participants };
};

const validateOperation = (operation: ExpenseOperation) => {
  try {
    asOperationID(operation.operationID);
  } catch {
    invalidField("operationID", "Invalid operation ID.");
  }
  if (
    !Number.isSafeInteger(operation.expectedVersion) ||
    operation.expectedVersion < 1 ||
    operation.expectedVersion >= Number.MAX_SAFE_INTEGER
  )
    invalidField("expectedVersion", "Invalid expense version.");
};

const mutationError = (error: unknown): never => {
  if (error instanceof ExpenseConflictError)
    throw new ApplicationError("conflict", error.message);
  if (error instanceof ExpenseNotFoundError)
    throw new ApplicationError("not_found", error.message);
  throw error;
};

export const requireExpense = async (
  actorID: UserID,
  splitID: SplitID,
  expenseID: ExpenseID,
) => {
  await requireMembership(actorID, splitID);
  const expense = await getSplitExpense(splitID, expenseID);
  if (!expense) throw new ApplicationError("not_found", "Expense not found.");
  return expense;
};

export const getExpenseHistory = async (
  actorID: UserID,
  splitID: SplitID,
  expenseID: ExpenseID,
) => {
  const expense = await requireExpense(actorID, splitID, expenseID);
  const revisions = await findExpenseRevisions(splitID, expenseID);
  return { expense, history: revisions };
};

export const editExpense = async (
  actorID: UserID,
  splitID: SplitID,
  expenseID: ExpenseID,
  operation: ExpenseOperation,
  input: Omit<NewExpense, "id">,
) =>
  logAction(
    "expense.edit",
    {
      userId: actorID,
      splitId: splitID,
      expenseId: expenseID,
      operationId: operation.operationID,
      expectedVersion: operation.expectedVersion,
      parameters: {
        currency: input.currency,
        amount: input.amount,
        payer: input.payer,
        participants: Object.fromEntries(input.participants),
      },
    },
    async () => {
      await requireMembership(actorID, splitID);
      validateOperation(operation);
      try {
        return await editSplitExpense(
          splitID,
          expenseID,
          actorID,
          operation,
          async (current) => {
            const [split, members] = await Promise.all([
              requireSplit(splitID),
              findSplitUsers(splitID),
            ]);
            const { amount, participants } = validateExpense(input, members);
            const conversionRate =
              input.currency === current.currency ? current.conversionRate
              : input.currency === split.currency ? undefined
              : await fetchCurrencyConversionRate(
                  input.currency,
                  split.currency,
                );
            if (
              conversionRate !== undefined &&
              (!Number.isFinite(conversionRate) || conversionRate <= 0)
            )
              throw new Error("Invalid exchange rate from currency provider");
            getLogger().appendKeys({ conversionRate });
            return {
              name: input.name,
              currency: input.currency,
              amount,
              participants,
              payer: input.payer,
              conversionRate,
            };
          },
        );
      } catch (error) {
        mutationError(error);
      }
    },
  );

export const deleteExpense = async (
  actorID: UserID,
  splitID: SplitID,
  expenseID: ExpenseID,
  operation: ExpenseOperation,
) =>
  logAction(
    "expense.delete",
    {
      userId: actorID,
      splitId: splitID,
      expenseId: expenseID,
      operationId: operation.operationID,
      expectedVersion: operation.expectedVersion,
    },
    async () => {
      await requireMembership(actorID, splitID);
      validateOperation(operation);
      try {
        return await deleteSplitExpense(splitID, expenseID, actorID, operation);
      } catch (error) {
        mutationError(error);
      }
    },
  );

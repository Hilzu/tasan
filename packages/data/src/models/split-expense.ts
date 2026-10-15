import { setTimeout } from "node:timers/promises";

import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  paginateQuery,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { compareByKey } from "@tasan/common/compare";
import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type { ExpenseID, OperationID, SplitID, UserID } from "@tasan/common/id";
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
  version: number;
  updatedAt?: Date;
  updatedBy?: UserID;
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
  version?: number;
  updatedAt?: string;
  updatedBy?: UserID;
  deletedAt?: string;
  deletedBy?: string;
}

type PrimaryKey = Pick<SplitExpenseItem, "pk" | "sk">;

interface ExpenseReadOptions {
  consistentRead?: boolean;
}

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
    version: item.version ?? 1,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    updatedBy: item.updatedBy,
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
    super("This expense ID has already been used for another user.");
    this.name = "ExpenseIDConflictError";
  }
}

// The first accepted creation wins, even if a retry changes the payload.
// Keep recognizing soft-deleted expenses so retries never resurrect them.
export const findExpenseCreation = async (
  splitID: SplitID,
  id: ExpenseID,
  actorID: UserID,
  options: ExpenseReadOptions = {},
): Promise<{ id: ExpenseID } | undefined> => {
  const item = await getSplitExpenseItem(splitID, id, options);
  if (!item) return undefined;
  if (item.createdBy !== actorID) throw new ExpenseIDConflictError();
  return { id };
};

export type CreateSplitExpense = Omit<
  SplitExpense,
  "createdAt" | "version" | "updatedAt" | "updatedBy"
>;

export const createSplitExpense = captureAsync(
  "createSplitExpense",
  async (expense: CreateSplitExpense): Promise<{ id: ExpenseID }> => {
    const { id } = expense;
    const Item: SplitExpenseItem = {
      pk: expense.splitID,
      sk: id,
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: expense.createdBy,
      amount: expense.amount.value,
      name: expense.name,
      currency: expense.currency,
      ...(expense.conversionRate === undefined ?
        {}
      : { conversionRate: expense.conversionRate }),
      payer: expense.payer,
      participants: Object.fromEntries(
        [...expense.participants].map(([k, v]) => [k, v.value]),
      ),
    };
    const cmd = new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName,
            Item,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Put: {
            TableName,
            Item: revisionItem(
              Item,
              id,
              "created",
              expense.createdBy,
              Item.createdAt,
            ),
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      ],
    });

    try {
      await sendExpenseTransaction(cmd);
    } catch (error) {
      if (!isConditionFailure(error) && !isTransactionConflict(error))
        throw error;
      const existing = await findExpenseCreation(
        expense.splitID,
        id,
        expense.createdBy,
        // The failed condition proves the item exists; read the committed write.
        { consistentRead: true },
      );
      if (existing) return existing;
      if (isTransactionConflict(error))
        throw new ExpenseConflictError(
          "This expense is being saved. Please try again.",
        );
      throw error;
    }
    return { id };
  },
);

const getSplitExpenseItem = captureAsync(
  "getSplitExpenseItem",
  async (
    splitID: SplitID,
    expenseID: ExpenseID,
    options: ExpenseReadOptions = {},
  ): Promise<SplitExpenseItem | undefined> => {
    const Key: PrimaryKey = { pk: splitID, sk: expenseID };
    const cmd = new GetCommand({
      TableName,
      Key,
      ConsistentRead: options.consistentRead ?? false,
    });
    const { Item } = await documentClient().send(cmd);
    return Item as SplitExpenseItem | undefined;
  },
);

export class ExpenseConflictError extends Error {
  constructor(
    message = "This expense has changed or was deleted. Reload it before saving again.",
  ) {
    super(message);
    this.name = "ExpenseConflictError";
  }
}

export class ExpenseNotFoundError extends Error {
  constructor() {
    super("Expense not found.");
    this.name = "ExpenseNotFoundError";
  }
}

type RevisionAction = "created" | "edited" | "deleted";
interface ExpenseRevisionItem {
  pk: string;
  sk: string;
  action: RevisionAction;
  recordedAt: string;
  recordedBy: UserID;
  state: SplitExpenseItem;
}

export interface ExpenseRevision {
  operationID?: OperationID;
  action: RevisionAction;
  recordedAt: Date;
  recordedBy: UserID;
  expense: SplitExpense;
}

// Keep history out of normal split reads, but allow querying a whole split's audit log.
const historyPartitionKey = (splitID: SplitID) => `history#${splitID}`;
const historyKey = (
  splitID: SplitID,
  expenseID: ExpenseID,
  id: ExpenseID | OperationID,
) => ({
  pk: historyPartitionKey(splitID),
  sk: `${expenseID}#${id}`,
});

const revisionItem = (
  state: SplitExpenseItem,
  id: ExpenseID | OperationID,
  action: RevisionAction,
  recordedBy: UserID,
  recordedAt: string,
): ExpenseRevisionItem => ({
  ...historyKey(state.pk, state.sk, id),
  action,
  recordedAt,
  recordedBy,
  state,
});

const isConditionFailure = (error: unknown) =>
  error instanceof TransactionCanceledException &&
  error.CancellationReasons?.some(
    (reason) => reason.Code === "ConditionalCheckFailed",
  );

// Retry contention only, using the same command and expected version each time.
const isTransactionConflict = (error: unknown) =>
  error instanceof TransactionCanceledException &&
  error.CancellationReasons?.some(
    (reason) => reason.Code === "TransactionConflict",
  ) &&
  error.CancellationReasons.every(
    (reason) => reason.Code === "None" || reason.Code === "TransactionConflict",
  );

const sendExpenseTransaction = async (command: TransactWriteCommand) => {
  for (let attempt = 0; ; attempt++) {
    try {
      await documentClient().send(command);
      return;
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === 2) throw error;
      await setTimeout(25 * 2 ** attempt);
    }
  }
};

export const getSplitExpense = async (
  splitID: SplitID,
  expenseID: ExpenseID,
) => {
  const item = await getSplitExpenseItem(splitID, expenseID, {
    consistentRead: true,
  });
  return item && !item.deletedAt ? fromItem({ ...item }) : undefined;
};

export interface ExpenseOperation {
  operationID: OperationID;
  expectedVersion: number;
}

export const findExpenseOperation = async (
  splitID: SplitID,
  expenseID: ExpenseID,
  operationID: OperationID,
  actorID: UserID,
  action: "edited" | "deleted",
): Promise<{ id: ExpenseID; version: number } | undefined> => {
  const { Item } = await documentClient().send(
    new GetCommand({
      TableName,
      Key: historyKey(splitID, expenseID, operationID),
      ConsistentRead: true,
    }),
  );
  if (!Item) return;
  const revision = Item as ExpenseRevisionItem;
  if (revision.recordedBy !== actorID || revision.action !== action)
    throw new ExpenseConflictError("This operation ID has already been used.");
  return { id: expenseID, version: revision.state.version ?? 1 };
};

export const findExpenseRevisions = async (
  splitID: SplitID,
  expenseID: ExpenseID,
): Promise<ExpenseRevision[]> => {
  const revisions: ExpenseRevision[] = [];
  for await (const page of paginateQuery(
    { client: documentClient() },
    {
      TableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": historyPartitionKey(splitID),
        ":prefix": `${expenseID}#`,
      },
      ConsistentRead: true,
    },
  )) {
    for (const item of page.Items ?? []) {
      const revision = item as ExpenseRevisionItem;
      revisions.push({
        operationID:
          revision.action === "created" ?
            undefined
          : (revision.sk.slice(expenseID.length + 1) as OperationID),
        action: revision.action,
        recordedAt: new Date(revision.recordedAt),
        recordedBy: revision.recordedBy,
        expense: fromItem({ ...revision.state }),
      });
    }
  }
  return revisions.sort((a, b) => a.expense.version - b.expense.version);
};

export type EditSplitExpense = Pick<
  SplitExpense,
  "name" | "amount" | "currency" | "conversionRate" | "payer" | "participants"
>;

const changeSplitExpense = async (
  splitID: SplitID,
  expenseID: ExpenseID,
  actorID: UserID,
  operation: ExpenseOperation,
  prepareChanges?: (current: SplitExpense) => Promise<EditSplitExpense>,
): Promise<{ id: ExpenseID; version: number }> => {
  const action = prepareChanges ? "edited" : "deleted";
  const previous = await findExpenseOperation(
    splitID,
    expenseID,
    operation.operationID,
    actorID,
    action,
  );
  if (previous) return previous;
  const current = await getSplitExpenseItem(splitID, expenseID, {
    consistentRead: true,
  });
  if (!current) throw new ExpenseNotFoundError();
  if (
    current.deletedAt ||
    (current.version ?? 1) !== operation.expectedVersion
  ) {
    const accepted = await findExpenseOperation(
      splitID,
      expenseID,
      operation.operationID,
      actorID,
      action,
    );
    if (accepted) return accepted;
    throw new ExpenseConflictError();
  }
  const changes = await prepareChanges?.(fromItem({ ...current }));
  const now = new Date().toISOString();
  const next: SplitExpenseItem = {
    ...current,
    version: operation.expectedVersion + 1,
    updatedAt: now,
    updatedBy: actorID,
  };
  if (changes) {
    Object.assign(next, {
      name: changes.name,
      currency: changes.currency,
      payer: changes.payer,
      conversionRate: changes.conversionRate,
      amount: changes.amount.value,
      participants: Object.fromEntries(
        [...changes.participants].map(([id, amount]) => [id, amount.value]),
      ),
    });
    // An absent attribute must remove the old rate when returning to the split currency.
    if (changes.conversionRate === undefined) delete next.conversionRate;
  } else {
    next.deletedAt = now;
    next.deletedBy = actorID;
  }
  const transactItems = [
    {
      Put: {
        TableName,
        Item: next,
        ConditionExpression:
          "attribute_exists(pk) AND attribute_not_exists(deletedAt) AND " +
          (current.version === undefined ?
            "attribute_not_exists(#version)"
          : "#version = :version"),
        ExpressionAttributeNames: { "#version": "version" },
        ...(current.version === undefined ?
          {}
        : {
            ExpressionAttributeValues: {
              ":version": operation.expectedVersion,
            },
          }),
      },
    },
    {
      Put: {
        TableName,
        Item: revisionItem(next, operation.operationID, action, actorID, now),
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
  ];
  // Legacy expenses get their original snapshot in the same transaction as their first change.
  if (current.version === undefined)
    transactItems.push({
      Put: {
        TableName,
        Item: revisionItem(
          { ...current, version: 1 },
          expenseID,
          "created",
          current.createdBy,
          current.createdAt,
        ),
        ConditionExpression: "attribute_not_exists(pk)",
      },
    });
  try {
    await sendExpenseTransaction(
      new TransactWriteCommand({ TransactItems: transactItems }),
    );
  } catch (error) {
    if (!isConditionFailure(error) && !isTransactionConflict(error))
      throw error;
    const accepted = await findExpenseOperation(
      splitID,
      expenseID,
      operation.operationID,
      actorID,
      action,
    );
    if (accepted) return accepted;
    throw new ExpenseConflictError();
  }
  return { id: expenseID, version: operation.expectedVersion + 1 };
};

export const editSplitExpense = captureAsync(
  "editSplitExpense",
  (
    splitID: SplitID,
    expenseID: ExpenseID,
    actorID: UserID,
    operation: ExpenseOperation,
    prepareChanges: (current: SplitExpense) => Promise<EditSplitExpense>,
  ) =>
    changeSplitExpense(splitID, expenseID, actorID, operation, prepareChanges),
);

export const deleteSplitExpense = captureAsync(
  "deleteSplitExpense",
  (
    splitID: SplitID,
    expenseID: ExpenseID,
    actorID: UserID,
    operation: ExpenseOperation,
  ) => changeSplitExpense(splitID, expenseID, actorID, operation),
);

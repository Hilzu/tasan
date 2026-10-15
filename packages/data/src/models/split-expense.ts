import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, paginateQuery, PutCommand } from "@aws-sdk/lib-dynamodb";
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
  updatedAt?: Date;
  updatedBy?: UserID;
  currency: CurrencySymbol;
  conversionRate?: number;
  payer: UserID;
  participants: Map<UserID, D.Decimal>;
}

interface SplitExpenseItem {
  pk: SplitID;
  sk: string;
  name: string;
  createdAt: string;
  createdBy: UserID;
  amount: number;
  currency: CurrencySymbol;
  conversionRate?: number;
  payer: UserID;
  participants: Record<UserID, number>;
  updatedAt?: string;
  updatedBy?: UserID;
  deletedAt?: string;
  deletedBy?: UserID;
}

interface ExpenseReadOptions {
  consistentRead?: boolean;
}

const expenseIDOf = (item: SplitExpenseItem) =>
  item.sk.split("#")[0] as ExpenseID;
const operationIDOf = (item: SplitExpenseItem) =>
  item.sk.split("#")[1] as OperationID | undefined;

const fromItem = (item: SplitExpenseItem): SplitExpense => {
  const fractionDigits = currencies[item.currency].fractions;
  return {
    id: expenseIDOf(item),
    splitID: item.pk,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    updatedBy: item.updatedBy,
    name: item.name,
    amount: D.create(item.amount, fractionDigits),
    createdBy: item.createdBy,
    createdAt: new Date(item.createdAt),
    currency: item.currency,
    conversionRate: item.conversionRate,
    payer: item.payer,
    participants: new Map(
      Object.entries(item.participants)
        .sort(compareByKey)
        .map(([id, amount]) => [
          id as UserID,
          D.create(amount, fractionDigits),
        ]),
    ),
  };
};

// A tombstone always wins, regardless of its operation ID or arrival order.
// Otherwise creation is the baseline and the greatest operation ID wins.
const latestItems = (items: SplitExpenseItem[]) => {
  const latest = new Map<ExpenseID, SplitExpenseItem>();
  for (const item of items) {
    const id = expenseIDOf(item);
    const current = latest.get(id);
    if (
      !current ||
      (!!item.deletedAt && !current.deletedAt) ||
      (!!item.deletedAt === !!current.deletedAt && item.sk > current.sk)
    )
      latest.set(id, item);
  }
  return [...latest.values()];
};

export const expensesFromItems = (items: Record<string, unknown>[]) =>
  latestItems(items as unknown as SplitExpenseItem[])
    .filter((item) => !item.deletedAt)
    .map(fromItem);

export class ExpenseIDConflictError extends Error {
  constructor() {
    super("This expense ID has already been used for another user.");
    this.name = "ExpenseIDConflictError";
  }
}

export class ExpenseConflictError extends Error {
  constructor(message = "This operation ID has already been used.") {
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

const getItem = async (
  splitID: SplitID,
  sk: string,
  options: ExpenseReadOptions = {},
): Promise<SplitExpenseItem | undefined> => {
  const { Item } = await documentClient().send(
    new GetCommand({
      TableName,
      Key: { pk: splitID, sk },
      ConsistentRead: options.consistentRead ?? false,
    }),
  );
  return Item as SplitExpenseItem | undefined;
};

export const findExpenseCreation = async (
  splitID: SplitID,
  id: ExpenseID,
  actorID: UserID,
  options: ExpenseReadOptions = {},
): Promise<{ id: ExpenseID } | undefined> => {
  const item = await getItem(splitID, id, options);
  if (!item) return;
  if (item.createdBy !== actorID) throw new ExpenseIDConflictError();
  return { id };
};

export type CreateSplitExpense = Omit<
  SplitExpense,
  "createdAt" | "updatedAt" | "updatedBy"
>;
export type EditSplitExpense = Pick<
  SplitExpense,
  "name" | "amount" | "currency" | "conversionRate" | "payer" | "participants"
>;

const storedChanges = (expense: EditSplitExpense) => ({
  name: expense.name,
  amount: expense.amount.value,
  currency: expense.currency,
  conversionRate: expense.conversionRate,
  payer: expense.payer,
  participants: Object.fromEntries(
    [...expense.participants].map(([id, amount]) => [id, amount.value]),
  ),
});

const insertItem = (Item: SplitExpenseItem) => {
  if (Item.conversionRate === undefined) delete Item.conversionRate;
  return documentClient().send(
    new PutCommand({
      TableName,
      Item,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
};

export const createSplitExpense = captureAsync(
  "createSplitExpense",
  async (expense: CreateSplitExpense): Promise<{ id: ExpenseID }> => {
    try {
      await insertItem({
        ...storedChanges(expense),
        pk: expense.splitID,
        sk: expense.id,
        createdAt: new Date().toISOString(),
        createdBy: expense.createdBy,
      });
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await findExpenseCreation(
        expense.splitID,
        expense.id,
        expense.createdBy,
        { consistentRead: true },
      );
      if (!existing) throw error;
      return existing;
    }
    return { id: expense.id };
  },
);

const expenseItems = async (splitID: SplitID, expenseID: ExpenseID) => {
  const items: SplitExpenseItem[] = [];
  for await (const page of paginateQuery(
    { client: documentClient() },
    {
      TableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": splitID, ":prefix": expenseID },
      ConsistentRead: true,
    },
  ))
    items.push(...((page.Items ?? []) as SplitExpenseItem[]));
  return items;
};

export const getSplitExpense = async (
  splitID: SplitID,
  expenseID: ExpenseID,
) => {
  const current = latestItems(await expenseItems(splitID, expenseID)).at(0);
  return current && !current.deletedAt ? fromItem(current) : undefined;
};

type RevisionAction = "created" | "edited" | "deleted";
export interface ExpenseRevision {
  operationID?: OperationID;
  action: RevisionAction;
  recordedAt: Date;
  recordedBy: UserID;
  expense: SplitExpense;
}

const actionOf = (item: SplitExpenseItem): RevisionAction =>
  item.deletedAt ? "deleted"
  : operationIDOf(item) ? "edited"
  : "created";

export const findExpenseOperation = async (
  splitID: SplitID,
  expenseID: ExpenseID,
  operationID: OperationID,
  actorID: UserID,
  action: "edited" | "deleted",
): Promise<{ id: ExpenseID } | undefined> => {
  const item = await getItem(splitID, `${expenseID}#${operationID}`, {
    consistentRead: true,
  });
  if (!item) return;
  if (item.updatedBy !== actorID || actionOf(item) !== action)
    throw new ExpenseConflictError();
  return { id: expenseID };
};

export const findExpenseRevisions = async (
  splitID: SplitID,
  expenseID: ExpenseID,
): Promise<ExpenseRevision[]> =>
  (await expenseItems(splitID, expenseID)).map((item) => ({
    operationID: operationIDOf(item),
    action: actionOf(item),
    recordedAt: new Date(item.updatedAt ?? item.createdAt),
    recordedBy: item.updatedBy ?? item.createdBy,
    expense: fromItem(item),
  }));

const changeSplitExpense = async (
  splitID: SplitID,
  expenseID: ExpenseID,
  actorID: UserID,
  operationID: OperationID,
  prepareChanges?: (current: SplitExpense) => Promise<EditSplitExpense>,
): Promise<{ id: ExpenseID }> => {
  const action = prepareChanges ? "edited" : "deleted";
  const previous = await findExpenseOperation(
    splitID,
    expenseID,
    operationID,
    actorID,
    action,
  );
  if (previous) return previous;
  const current = latestItems(await expenseItems(splitID, expenseID)).at(0);
  if (!current || current.deletedAt) {
    // A concurrent copy of this request may have committed after the lookup.
    const accepted = await findExpenseOperation(
      splitID,
      expenseID,
      operationID,
      actorID,
      action,
    );
    if (accepted) return accepted;
    throw new ExpenseNotFoundError();
  }
  const changes = await prepareChanges?.(fromItem(current));
  const now = new Date().toISOString();
  // Never replace the creation or another operation. A concurrent delete may
  // arrive after this read; the read reducer will still keep it terminal.
  const next: SplitExpenseItem = {
    ...current,
    ...(changes ?
      storedChanges(changes)
    : { deletedAt: now, deletedBy: actorID }),
    sk: `${expenseID}#${operationID}`,
    updatedAt: now,
    updatedBy: actorID,
  };
  try {
    await insertItem(next);
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
    const accepted = await findExpenseOperation(
      splitID,
      expenseID,
      operationID,
      actorID,
      action,
    );
    if (!accepted) throw error;
    return accepted;
  }
  return { id: expenseID };
};

export const editSplitExpense = captureAsync(
  "editSplitExpense",
  (
    splitID: SplitID,
    expenseID: ExpenseID,
    actorID: UserID,
    operationID: OperationID,
    prepareChanges: (current: SplitExpense) => Promise<EditSplitExpense>,
  ) =>
    changeSplitExpense(
      splitID,
      expenseID,
      actorID,
      operationID,
      prepareChanges,
    ),
);

export const deleteSplitExpense = captureAsync(
  "deleteSplitExpense",
  (
    splitID: SplitID,
    expenseID: ExpenseID,
    actorID: UserID,
    operationID: OperationID,
  ) => changeSplitExpense(splitID, expenseID, actorID, operationID),
);

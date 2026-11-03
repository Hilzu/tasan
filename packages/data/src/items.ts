// Internal persistence schemas. Do not export these through the package entry point.
import { NumberValue } from "@aws-sdk/lib-dynamodb";
import * as Rate from "@tasan/common/exchange-rate";
import {
  asExpenseID,
  asInviteID,
  asOperationID,
  asSessionID,
  asSplitID,
  type ExpenseID,
  type OperationID,
} from "@tasan/common/id";
import * as Money from "@tasan/common/money";
import {
  cognitoIDSchema,
  currencySymbolSchema,
  expenseIDSchema,
  operationIDSchema,
  userIDSchema,
} from "@tasan/common/validation";
import { z } from "zod";

import { DataIntegrityError } from "./errors.js";

const idSchema = <T>(validate: (id: string) => T) =>
  z.string().transform((id, ctx) => {
    try {
      return validate(id);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid ID" });
      return z.NEVER;
    }
  });
const splitIDSchema = idSchema(asSplitID);
const sessionIDSchema = idSchema(asSessionID);
const inviteIDSchema = idSchema(asInviteID);
const timestamp = z.iso.datetime();
const numericText = z
  .instanceof(NumberValue)
  .transform((value) => value.toString());
const storedDecimal = z.union([
  numericText,
  z.string(),
  z.number().transform(String),
]);
const storedRate = storedDecimal.transform((text, ctx) => {
  try {
    return Rate.create(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid rate" });
    return z.NEVER;
  }
});
const expiry = z.preprocess(
  (value) => (value instanceof NumberValue ? Number(value.toString()) : value),
  z
    .number()
    .int()
    .refine(
      (value) =>
        Number.isSafeInteger(value) &&
        Number.isFinite(new Date(value * 1000).getTime()),
    ),
);

export const userItemSchema = z
  .object({
    pk: userIDSchema,
    sk: userIDSchema,
    name: z.string(),
    email: z.string(),
    locale: z.string().optional(),
    createdAt: timestamp,
  })
  .refine((item) => item.pk === item.sk);
export type UserItem = z.infer<typeof userItemSchema>;

export const cognitoUserItemSchema = z.union([
  z
    .object({
      pk: cognitoIDSchema,
      sk: cognitoIDSchema,
      userID: userIDSchema,
      createdAt: timestamp,
    })
    .refine((item) => item.pk === item.sk),
  // Existing mappings keep their original user ID and creation timestamp.
  z.object({
    pk: cognitoIDSchema,
    sk: userIDSchema,
    createdAt: timestamp,
  }),
]);
export type CognitoUserItem = z.infer<typeof cognitoUserItemSchema>;

export const sessionItemSchema = z
  .object({
    pk: sessionIDSchema,
    sk: sessionIDSchema,
    createdAt: timestamp,
    expiresAt: expiry,
    absoluteExpiresAt: expiry.optional(),
    forUser: userIDSchema.optional(),
    authState: z.string().optional(),
    authNonce: z.string().optional(),
    authRedirect: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  })
  .refine((item) => item.pk === item.sk);
export type SessionItem = z.infer<typeof sessionItemSchema>;

export const splitItemSchema = z
  .object({
    pk: splitIDSchema,
    sk: splitIDSchema,
    createdAt: timestamp,
    createdBy: userIDSchema,
    name: z.string(),
    currency: currencySymbolSchema,
  })
  .refine((item) => item.pk === item.sk);
export type SplitItem = z.infer<typeof splitItemSchema>;

export const splitUserItemSchema = z.object({
  pk: splitIDSchema,
  sk: userIDSchema,
  createdAt: timestamp,
  createdBy: userIDSchema,
});
export type SplitUserItem = z.infer<typeof splitUserItemSchema>;

export const inviteSplitItemSchema = z.object({
  pk: inviteIDSchema,
  sk: splitIDSchema,
  createdAt: timestamp,
  createdBy: userIDSchema,
  expiresAt: expiry,
});
export type InviteSplitItem = z.infer<typeof inviteSplitItemSchema>;

export const expenseOperationKey = (
  expenseID: ExpenseID,
  operationID: OperationID,
) => `${expenseID}#${operationID}` as const;
const operationKeySchema = z.string().transform((key, ctx) => {
  const parts = key.split("#");
  const expense = expenseIDSchema.safeParse(parts[0]);
  const operation = operationIDSchema.safeParse(parts[1]);
  if (parts.length !== 2 || !expense.success || !operation.success) {
    ctx.addIssue({ code: "custom", message: "Invalid expense operation key" });
    return z.NEVER;
  }
  return expenseOperationKey(expense.data, operation.data);
});
const expenseFields = z.object({
  kind: z.enum(["expense", "repayment"]).optional(),
  pk: splitIDSchema,
  name: z.string(),
  createdAt: timestamp,
  createdBy: userIDSchema,
  amount: storedDecimal,
  currency: currencySymbolSchema,
  conversionRate: storedRate.optional(),
  payer: userIDSchema,
  participants: z.record(userIDSchema, storedDecimal),
  // Legacy baseline soft deletions did not always record deletedBy.
  deletedAt: timestamp.optional(),
  deletedBy: userIDSchema.optional(),
});
export const splitExpenseItemSchema = z
  .union([
    expenseFields.extend({
      sk: expenseIDSchema,
      updatedAt: timestamp.optional(),
      updatedBy: userIDSchema.optional(),
    }),
    expenseFields.extend({
      sk: operationKeySchema,
      updatedAt: timestamp,
      updatedBy: userIDSchema,
    }),
  ])
  .superRefine((item, ctx) => {
    try {
      Money.round(item.amount, item.currency);
      for (const amount of Object.values(item.participants))
        Money.round(amount, item.currency);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid stored monetary amount",
      });
    }
  });
export type SplitExpenseItem = z.infer<typeof splitExpenseItemSchema>;

export const expenseIDOf = (item: SplitExpenseItem) =>
  asExpenseID(item.sk.split("#")[0]);
export const operationIDOf = (item: SplitExpenseItem) => {
  const operation = item.sk.split("#").at(1);
  return operation === undefined ? undefined : asOperationID(operation);
};

/** Validate at the storage boundary without attaching records or Zod errors to exceptions. */
export const parseItem = <T>(
  schema: z.ZodType<T>,
  input: unknown,
  model: string,
): T => {
  const result = schema.safeParse(input);
  if (!result.success) throw new DataIntegrityError(model);
  return result.data;
};

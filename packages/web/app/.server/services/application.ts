import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import type {
  CognitoUserID,
  ExpenseID,
  InviteID,
  SplitID,
  UserID,
} from "@tasan/common/id";
import type * as persistence from "@tasan/data";

import { ApplicationError } from "./errors";

// These are the concrete access patterns needed by the use cases. Transaction
// boundaries are implemented by the persistence adapter, not by route modules.
export type ApplicationDependencies = Pick<
  typeof persistence,
  | "createSplit"
  | "findUsersSplits"
  | "getSplit"
  | "getSplitUser"
  | "getSplitWithData"
  | "findSplitUsers"
  | "getUsers"
  | "createSplitExpense"
  | "deleteSplitExpense"
  | "createInviteForSplit"
  | "findInviteForSplit"
  | "consumeInviteForSplit"
  | "ensureCognitoUser"
  | "putUser"
> & {
  fetchCurrencyConversionRate: (
    from: CurrencySymbol,
    to: CurrencySymbol,
  ) => Promise<number>;
  now: () => Date;
};

export interface NewSplit {
  name: string;
  currency: CurrencySymbol;
}

export interface NewExpense {
  name: string;
  currency: CurrencySymbol;
  amount: number;
  payer: UserID;
  participants: Map<UserID, number>;
}

const invalidField = (field: string, message: string): never => {
  throw new ApplicationError("invalid_input", message, { [field]: [message] });
};

const validateName = (name: string) => {
  if (name.length < 1 || name.length > 64)
    invalidField("name", "Name must contain between 1 and 64 characters.");
};

const validateCurrency = (currency: CurrencySymbol) => {
  if (!Object.hasOwn(currencies, currency))
    invalidField("currency", "Invalid currency symbol.");
};

const toAmount = (value: number, currency: CurrencySymbol, field: string) => {
  const amount = D.create(value, currencies[currency].fractions);
  if (!Number.isFinite(value) || value <= 0 || !D.equals(amount, value))
    invalidField(
      field,
      `Amount must be positive and use ${String(currencies[currency].fractions)} decimal places at most.`,
    );
  return amount;
};

export const createApplication = (deps: ApplicationDependencies) => {
  const requireMembership = async (actorID: UserID, splitID: SplitID) => {
    if (!(await deps.getSplitUser(actorID, splitID)))
      throw new ApplicationError("not_found", "Split not found.");
  };

  const requireSplit = async (splitID: SplitID) => {
    const split = await deps.getSplit(splitID);
    if (!split) throw new ApplicationError("not_found", "Split not found.");
    return split;
  };

  const requireInvite = async (inviteID: InviteID) => {
    const invite = await deps.findInviteForSplit(inviteID);
    if (!invite || invite.expiresAt.getTime() <= deps.now().getTime())
      throw new ApplicationError("not_found", "Invite not found or expired.");
    return invite;
  };

  return {
    listSplits: (actorID: UserID) => deps.findUsersSplits(actorID),

    async createSplit(actorID: UserID, input: NewSplit) {
      validateName(input.name);
      validateCurrency(input.currency);
      return deps.createSplit({ ...input, createdBy: actorID });
    },

    async getSplit(actorID: UserID, splitID: SplitID) {
      await requireMembership(actorID, splitID);
      const split = await deps.getSplitWithData(splitID);
      if (!split) throw new ApplicationError("not_found", "Split not found.");
      const users = await deps.getUsers(split.userIDs);
      return { split, users };
    },

    async createExpense(actorID: UserID, splitID: SplitID, input: NewExpense) {
      await requireMembership(actorID, splitID);
      const split = await requireSplit(splitID);
      validateName(input.name);
      validateCurrency(input.currency);
      const amount = toAmount(input.amount, input.currency, "amount");
      const members = new Set(
        (await deps.findSplitUsers(splitID)).map((user) => user.userID),
      );
      if (!members.has(input.payer))
        invalidField("payer", "Payer must be in the split.");
      if (input.participants.size === 0)
        invalidField("participants", "Participants are required.");
      const participants = new Map<UserID, D.Decimal>();
      for (const [userID, value] of input.participants) {
        if (!members.has(userID))
          invalidField("participants", "Participants must be in the split.");
        participants.set(
          userID,
          toAmount(value, input.currency, "participants"),
        );
      }
      const total = [...participants.values()].reduce(
        (sum, share) => D.add(sum, share),
        D.create(0, amount.fractions),
      );
      if (!D.equals(total, amount))
        invalidField(
          "participants",
          "Total amount must match the expense amount.",
        );
      const conversionRate =
        input.currency === split.currency ?
          undefined
        : await deps.fetchCurrencyConversionRate(
            input.currency,
            split.currency,
          );
      if (
        conversionRate !== undefined &&
        (!Number.isFinite(conversionRate) || conversionRate <= 0)
      )
        throw new Error("Invalid exchange rate from currency provider");
      return deps.createSplitExpense({
        splitID,
        name: input.name,
        currency: input.currency,
        amount,
        payer: input.payer,
        participants,
        conversionRate,
        createdBy: actorID,
      });
    },

    async deleteExpense(
      actorID: UserID,
      splitID: SplitID,
      expenseID: ExpenseID,
    ) {
      await requireMembership(actorID, splitID);
      await deps.deleteSplitExpense(splitID, expenseID, actorID);
    },

    async createInvite(actorID: UserID, splitID: SplitID) {
      await requireMembership(actorID, splitID);
      await requireSplit(splitID);
      return deps.createInviteForSplit({ splitID, createdBy: actorID });
    },

    async previewInvite(inviteID: InviteID) {
      const invite = await requireInvite(inviteID);
      // The confirmation page needs only split metadata, not its expenses.
      return { split: await requireSplit(invite.splitID) };
    },

    async acceptInvite(actorID: UserID, inviteID: InviteID) {
      const invite = await requireInvite(inviteID);
      await requireSplit(invite.splitID);
      if (!(await deps.consumeInviteForSplit(invite, actorID)))
        throw new ApplicationError("not_found", "Invite not found or expired.");
      return { splitID: invite.splitID };
    },

    async provisionAuthenticatedUser(input: {
      cognitoID: CognitoUserID;
      email: string;
      name: string;
    }) {
      const { userID } = await deps.ensureCognitoUser({
        cognitoID: input.cognitoID,
      });
      await deps.putUser({ id: userID, email: input.email, name: input.name });
      return { userID };
    },
  };
};

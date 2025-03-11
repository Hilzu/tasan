import { ulid } from "ulid";

const genUlid = () => ulid().toLowerCase();

type ID<T extends string> = string & { __prefix: T };

const genID = <T extends string>(prefix: T): ID<T> =>
  `${prefix}_${genUlid()}` as ID<T>;

const ulidRegex = /^[0-7][0-9abcdefghjkmnpqrstvwxyz]{25}$/;

const asValidID = <T extends string>(prefix: T, id: string): ID<T> => {
  const [p, u] = id.split("_");
  if (p !== prefix) throw new Error(`Invalid ${prefix} id: ${id}`);
  if (!ulidRegex.test(u)) throw new Error(`Invalid ulid in id: ${id}`);
  // TODO: extract timestamp and check it's not in the future or too old
  return id as ID<T>;
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const asValidUUID = (id: string): string => {
  const uuid = id.toLowerCase().trim();
  if (!uuidRegex.test(uuid)) throw new Error(`Invalid uuid: ${id}`);
  return uuid;
};

// user
export type UserID = ID<"usr">;
export const genUserID = () => genID("usr");
export const asValidUserID = (id: string) => asValidID("usr", id);
export function assertValidUserID(id: string): asserts id is UserID {
  asValidUserID(id);
}

// session
export type SessionID = ID<"ses">;
export const genSessionID = () => genID("ses");
export const asValidSessionID = (id: string) => asValidID("ses", id);
export function assertValidSessionID(id: string): asserts id is SessionID {
  asValidSessionID(id);
}

// split
export type SplitID = ID<"spl">;
export const genSplitID = () => genID("spl");
export const asValidSplitID = (id: string) => asValidID("spl", id);
export function assertValidSplitID(id: string): asserts id is SplitID {
  asValidSplitID(id);
}

// invite
export type InviteID = ID<"inv">;
export const genInviteID = () => genID("inv");
export const asValidInviteID = (id: string) => asValidID("inv", id);
export function assertValidInviteID(id: string): asserts id is InviteID {
  asValidInviteID(id);
}

// Cognito user
export type CognitoUserID = ID<"cog">;
export const asValidCognitoUserID = (id: string) => {
  const uuid = id.split("cog_").at(-1);
  if (!uuid) throw new Error(`Invalid Cognito user id: ${id}`);
  return `cog_${asValidUUID(uuid)}` as CognitoUserID;
};

// expense
export type ExpenseID = ID<"exp">;
export const genExpenseID = () => genID("exp");
export const asValidExpenseID = (id: string) => asValidID("exp", id);
export function assertValidExpenseID(id: string): asserts id is ExpenseID {
  asValidExpenseID(id);
}

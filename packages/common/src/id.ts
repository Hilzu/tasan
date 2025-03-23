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
export const asUserID = (id: string) => asValidID("usr", id);

// session
export type SessionID = ID<"ses">;
export const genSessionID = () => genID("ses");
export const asSessionID = (id: string) => asValidID("ses", id);

// split
export type SplitID = ID<"spl">;
export const genSplitID = () => genID("spl");
export const asSplitID = (id: string) => asValidID("spl", id);

// invite
export type InviteID = ID<"inv">;
export const genInviteID = () => genID("inv");
export const asInviteID = (id: string) => asValidID("inv", id);

// Cognito user
export type CognitoUserID = ID<"cog">;
export const asCognitoUserID = (id: string) => {
  const uuid = id.split("cog_").at(-1);
  if (!uuid) throw new Error(`Invalid Cognito user id: ${id}`);
  return `cog_${asValidUUID(uuid)}` as CognitoUserID;
};

// expense
export type ExpenseID = ID<"exp">;
export const genExpenseID = () => genID("exp");
export const asExpenseID = (id: string) => asValidID("exp", id);

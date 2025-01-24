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

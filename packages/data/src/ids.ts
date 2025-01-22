import { ulid } from "ulid";

const genUlid = () => ulid().toLowerCase();

const genId = (prefix: string) => `${prefix}_${genUlid()}`;

const ulidRegex = /^[0-9abcdefghjkmnpqrstvwxyz]{26}$/;

const assertValidId = (prefix: string, id: string) => {
  const [p, u] = id.split("_");
  if (p !== prefix) throw new Error(`Invalid ${prefix} id: ${id}`);
  if (!ulidRegex.test(u)) throw new Error(`Invalid ulid in id: ${id}`);
  return id;
};

// user
export const genUserId = () => genId("usr");
export const assertValidUserId = (id: string) => assertValidId("usr", id);

// session
export const genSessionId = () => genId("ses");
export const assertValidSessionId = (id: string) => assertValidId("ses", id);

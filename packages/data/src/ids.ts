import { ulid } from "ulid";

const genUlid = () => ulid().toLowerCase();

const genId = (prefix: string) => `${prefix}_${genUlid()}`;

export const genUserId = () => genId("usr");

export const genSessionId = () => genId("ses");

import {
  createSession,
  deleteSession,
  putSession,
  readSession,
} from "@tasan/data";
import { type CookieOptions, createSessionStorage } from "react-router";

import { cookieSignSecret } from "~/config";

interface SessionData {
  userId: string;
}

const createDataSessionStorage = (
  cookie: CookieOptions & { name?: string },
) => {
  return createSessionStorage<SessionData, unknown>({
    cookie,
    async createData(data, expires) {
      if (!data.userId) throw new Error("Missing userId");
      if (!expires) throw new Error("Missing expires");

      const { id } = await createSession({
        userId: data.userId,
        expiresAt: expires,
      });
      return id;
    },
    async readData(id) {
      const session = await readSession(id);
      if (!session) return null;
      return {
        userId: session.userId,
      };
    },
    async updateData(id, data, expires) {
      if (!data.userId) throw new Error("Missing userId");
      if (!expires) throw new Error("Missing expires");

      await putSession({ id, userId: data.userId, expiresAt: expires });
    },
    async deleteData(id) {
      await deleteSession(id);
    },
  });
};

const { getSession, commitSession, destroySession } = createDataSessionStorage({
  name: "__session",
  // domain
  httpOnly: true,
  maxAge: 14 * 24 * 60 * 60,
  path: "/",
  sameSite: "lax",
  secrets: [cookieSignSecret],
  secure: true,
});

export { commitSession, destroySession, getSession };

import {
  createSession,
  deleteSession,
  getSession as getSessionData,
  putSession,
} from "@tasan/data";
import { type CookieOptions, createSessionStorage } from "react-router";

import { cookieSignSecret, originURL } from "~/config";

interface SessionData {
  userID: string;
}

const createDataSessionStorage = (
  cookie: CookieOptions & { name?: string },
) => {
  return createSessionStorage<SessionData, unknown>({
    cookie,
    async createData(data, expires) {
      if (!data.userID) throw new Error("Missing userId");
      if (!expires) throw new Error("Missing expires");

      const { id } = await createSession({
        userID: data.userID,
        expiresAt: expires,
      });
      return id;
    },
    async readData(id) {
      const session = await getSessionData(id);
      if (!session) return null;
      return {
        userID: session.userID,
      };
    },
    async updateData(id, data, expires) {
      if (!data.userID) throw new Error("Missing userId");
      if (!expires) throw new Error("Missing expires");

      await putSession({ id, userID: data.userID, expiresAt: expires });
    },
    async deleteData(id) {
      await deleteSession(id);
    },
  });
};

// TODO: make the cookies work when using the local site from phone
const { getSession, commitSession, destroySession } = createDataSessionStorage({
  name: "__session",
  domain: originURL.hostname,
  httpOnly: true,
  maxAge: 14 * 24 * 60 * 60,
  path: "/",
  sameSite: "lax",
  secrets: [cookieSignSecret],
  secure: originURL.protocol === "https:",
});

export { commitSession, destroySession, getSession };

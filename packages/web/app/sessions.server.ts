import { asSessionID, type UserID } from "@tasan/common/id";
import {
  createSession,
  deleteSession,
  getSession as getSessionData,
  putSession,
} from "@tasan/data";
import { type CookieOptions, createSessionStorage } from "react-router";

import { originURL } from "~/config";
import { cookieSignSecrets } from "~/secrets.server";

interface SessionData {
  userID: UserID;
  authState: string;
  authNonce: string;
  authRedirect: string;
  accessToken: string;
  refreshToken: string;
}

const createDataSessionStorage = (
  cookie: CookieOptions & { name?: string },
) => {
  return createSessionStorage<SessionData, unknown>({
    cookie,
    async createData(data, expires) {
      if (!expires) throw new Error("Missing expires");

      const { id } = await createSession({ ...data, expiresAt: expires });
      return id;
    },
    async readData(id) {
      const session = await getSessionData(asSessionID(id));
      if (!session) return null;
      return session;
    },
    async updateData(id, data, expires) {
      if (!expires) throw new Error("Missing expires");

      await putSession({
        ...data,
        id: asSessionID(id),
        expiresAt: expires,
      });
    },
    async deleteData(id) {
      await deleteSession(asSessionID(id));
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
  secrets: cookieSignSecrets,
  secure: originURL.protocol === "https:",
});

export { commitSession, destroySession, getSession };

import { asSessionID, type UserID } from "@tasan/common/id";
import {
  createSession as createStoredSession,
  deleteSession,
  getSession as getSessionData,
  refreshSession,
  type Session as StoredSession,
} from "@tasan/data";
import { createCookie, createSession, type Session } from "react-router";

import { cookieSignSecrets } from "~/.server/secrets";
import { originURL } from "~/config";

export interface SessionData {
  userID?: UserID;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
  accessToken?: string;
  refreshToken?: string;
}

type AppSession = Session<SessionData>;
const day = 24 * 60 * 60;
const idleLifetime = 7 * day;
const absoluteLifetime = 30 * day;
const loginLifetime = 10 * 60;
const refreshInterval = 60 * 60;
const loadedSessionRecords = new WeakMap<AppSession, StoredSession>();

// TODO: make the cookies work when using the local site from phone
const cookie = createCookie("__session", {
  domain: originURL.hostname,
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secrets: cookieSignSecrets,
  secure: originURL.protocol === "https:",
});

const serialize = (id: string, expiresAt: Date) =>
  cookie.serialize(id, {
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });

export async function getSession(
  cookieHeader: string | null,
): Promise<AppSession> {
  const id: unknown = await cookie.parse(cookieHeader);
  if (typeof id !== "string" || !id) return createSession<SessionData>();
  const record = await getSessionData(asSessionID(id));
  // Do not retain a stale ID: expired or revoked sessions must never be revived.
  if (!record) return createSession<SessionData>();
  const session = createSession<SessionData>(
    {
      userID: record.userID,
      authState: record.authState,
      authNonce: record.authNonce,
      authRedirect: record.authRedirect,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
    },
    record.id,
  );
  loadedSessionRecords.set(session, record);
  return session;
}

export async function commitSession(session: AppSession): Promise<string> {
  const previous = loadedSessionRecords.get(session);
  const now = Date.now();
  const userID = session.get("userID");
  // A successful sign-in gets a fresh ID and a new absolute deadline. Legacy
  // sessions without that deadline can never outlive their existing expiry.
  const absoluteExpiresAt =
    userID ?
      previous?.userID === userID ?
        (previous.absoluteExpiresAt ?? previous.expiresAt)
      : new Date(now + absoluteLifetime * 1000)
    : undefined;
  const expiresAt = new Date(
    Math.min(
      now + (userID ? idleLifetime : loginLifetime) * 1000,
      absoluteExpiresAt?.getTime() ?? Infinity,
    ),
  );
  const { id } = await createStoredSession({
    ...session.data,
    expiresAt,
    absoluteExpiresAt,
  });
  // Explicit commits happen at sign-in and rotate the ID, including the
  // anonymous OAuth session, rather than upgrading an existing bearer token.
  if (previous) await deleteSession(previous.id);
  return serialize(id, expiresAt);
}

export async function refreshSessionCookie(
  session: AppSession,
): Promise<string | undefined> {
  const record = loadedSessionRecords.get(session);
  if (!record?.userID) return;
  const now = Date.now();
  const expiresAt = new Date(
    Math.min(
      now + idleLifetime * 1000,
      (record.absoluteExpiresAt ?? record.expiresAt).getTime(),
    ),
  );
  // Bound writes during active use to once an hour. Near the absolute deadline
  // there is nothing to extend, and anonymous OAuth sessions never slide.
  if (expiresAt.getTime() - record.expiresAt.getTime() < refreshInterval * 1000)
    return;
  if (!(await refreshSession(record.id, expiresAt, record.expiresAt))) return;
  return serialize(record.id, expiresAt);
}

export async function destroySession(session: AppSession): Promise<string> {
  const record = loadedSessionRecords.get(session);
  if (record) await deleteSession(record.id);
  return cookie.serialize("", { expires: new Date(0) });
}

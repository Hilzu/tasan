import { isIP } from "node:net";

import { asSessionID, type UserID } from "@tasan/common/id";
import { getLogger, logError } from "@tasan/common/logging";
import {
  createSession as createStoredSession,
  deleteSession,
  getSession as getSessionData,
  markSessionVerified,
  refreshSession,
  type Session as StoredSession,
} from "@tasan/data";
import { createCookie, createSession, type Session } from "react-router";

import { isCognitoUserActive } from "~/.server/cognito";
import { cookieSignSecrets } from "~/.server/secrets";
import { authDisable, originURL } from "~/config";

export interface SessionData {
  userID?: UserID;
  cognitoUsername?: string;
  authState?: string;
  authNonce?: string;
  authRedirect?: string;
}

type AppSession = Session<SessionData>;
const day = 24 * 60 * 60;
const idleLifetime = 7 * day;
const absoluteLifetime = 30 * day;
const loginLifetime = 10 * 60;
const refreshInterval = 60 * 60;
const verificationInterval = 60 * 60;
const loadedSessionRecords = new WeakMap<AppSession, StoredSession>();

// TODO: make the cookies work when using the local site from phone
const cookie = createCookie("__session", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secrets: cookieSignSecrets,
  secure: originURL.protocol === "https:",
});

export const clearLegacySessionCookie = async () => {
  const hostname = originURL.hostname;
  // Browsers can treat a Domain cookie on a local host as the host-only cookie.
  if (hostname === "localhost" || isIP(hostname.replace(/^\[|\]$/g, "")))
    return;
  return await cookie.serialize("", {
    domain: hostname,
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
};

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
  if (record.userID && !(await verifyAccount(record))) {
    await deleteSession(record.id);
    return createSession<SessionData>();
  }
  const session = createSession<SessionData>(
    {
      userID: record.userID,
      cognitoUsername: record.cognitoUsername,
      authState: record.authState,
      authNonce: record.authNonce,
      authRedirect: record.authRedirect,
    },
    record.id,
  );
  loadedSessionRecords.set(session, record);
  return session;
}

/**
 * Revoke sessions whose Cognito account was deleted or disabled. The check
 * runs with session renewal at most once an hour, so revocation applies within
 * an hour without shortening the session. Cognito outages do not sign users
 * out; the check is retried on the next request instead.
 */
async function verifyAccount(record: StoredSession): Promise<boolean> {
  if (authDisable) return true;
  const username = record.cognitoUsername;
  // Sessions created before account checks cannot be checked; sign in again.
  if (!username) return false;
  const now = new Date();
  const lastVerified = record.verifiedAt ?? record.createdAt;
  if (
    lastVerified &&
    now.getTime() - lastVerified.getTime() < verificationInterval * 1000
  )
    return true;
  let active: boolean;
  try {
    active = await isCognitoUserActive(username);
  } catch (error) {
    logError("Cognito account check failed", error);
    return true;
  }
  if (!active) {
    getLogger().info("Session revoked for inactive Cognito account", {
      action: "auth.revoke",
      userId: record.userID,
    });
    return false;
  }
  try {
    await markSessionVerified(record.id, now);
  } catch (error) {
    logError("Recording Cognito account check failed", error);
  }
  return true;
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
    // Sign-in has just been authenticated by Cognito.
    verifiedAt: userID ? new Date(now) : undefined,
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

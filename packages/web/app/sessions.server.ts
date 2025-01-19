import { createCookieSessionStorage } from "react-router";

interface SessionData {
  id: string;
  name: string;
}

interface SessionFlashData {
  error: string;
}

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__session",
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      // secrets: ["s3cret1"],
      secure: true,
    },
  });

export { commitSession, destroySession, getSession };

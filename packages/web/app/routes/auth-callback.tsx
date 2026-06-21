import { cognitoIDSchema } from "@tasan/common/validation";
import { ensureCognitoUser, putUser } from "@tasan/data";
import { redirect } from "react-router";
import { z } from "zod";

import { getTokens } from "~/.server/openid";
import { commitSession, getSession } from "~/.server/sessions";
import { originURL } from "~/config";
import { toRelativePath } from "~/url";

import type { Route } from "./+types/auth-callback";

const claimsSchema = z.object({
  sub: cognitoIDSchema,
  email: z.email(),
  "cognito:username": z.string().min(1),
});

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("cookie"));

  const state = session.get("authState");
  const nonce = session.get("authNonce");
  const currentURL = new URL(toRelativePath(request.url), originURL);
  const tokens = await getTokens({ currentURL, state, nonce });
  if (!tokens.refresh_token) throw new Error("No refresh token");

  console.log("claims", tokens.claims());
  const claims = claimsSchema.parse(tokens.claims());
  const { userID } = await ensureCognitoUser({ cognitoID: claims.sub });
  await putUser({
    id: userID,
    email: claims.email,
    name: claims["cognito:username"],
  });

  session.unset("authState");
  session.unset("authNonce");
  session.set("userID", userID);
  session.set("accessToken", tokens.access_token);
  session.set("refreshToken", tokens.refresh_token);
  const authRedirect = session.get("authRedirect");
  session.unset("authRedirect");

  return redirect(toRelativePath(authRedirect ?? "/"), {
    headers: { "set-cookie": await commitSession(session) },
  });
}

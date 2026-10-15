import { getLogger } from "@tasan/common/logging";
import { cognitoIDSchema } from "@tasan/common/validation";
import { redirect } from "react-router";
import { z } from "zod";

import { sessionContext } from "~/.server/auth";
import { getTokens } from "~/.server/openid";
import { provisionAuthenticatedUser } from "~/.server/services/users";
import { commitSession } from "~/.server/sessions";
import { originURL } from "~/config";
import { toRelativePath } from "~/url";

import type { Route } from "./+types/auth-callback";

const claimsSchema = z.object({
  sub: cognitoIDSchema,
  email: z.email(),
  "cognito:username": z.string().min(1),
});

export async function loader({ context, request }: Route.LoaderArgs) {
  const session = context.get(sessionContext);

  const state = session.get("authState");
  const nonce = session.get("authNonce");
  const currentURL = new URL(toRelativePath(request.url), originURL);
  const tokens = await getTokens({ currentURL, state, nonce });
  if (!tokens.refresh_token) throw new Error("No refresh token");

  const claims = claimsSchema.parse(tokens.claims());
  const { userID } = await provisionAuthenticatedUser({
    cognitoID: claims.sub,
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

  const cookie = await commitSession(session);
  getLogger().info("Login completed", {
    action: "auth.login",
    outcome: "success",
    userId: userID,
  });
  return redirect(toRelativePath(authRedirect ?? "/"), {
    headers: { "set-cookie": cookie },
  });
}

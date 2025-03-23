import { captureAsync } from "@tasan/common/tracing";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  discovery,
  randomNonce,
  randomState,
} from "openid-client";

import { authClientSecret } from "~/.server/secrets";
import { authClientID, authServerURL, originURL } from "~/config";

const config = await discovery(authServerURL, authClientID, authClientSecret);

export const buildAuthorizationURL = () => {
  const state = randomState();
  const nonce = randomNonce();
  // Parameters documented here: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html#get-authorize
  const params = new URLSearchParams({
    response_type: "code",
    client_id: authClientID,
    redirect_uri: new URL("/auth-callback", originURL).href,
    scope: "aws.cognito.signin.user.admin openid email profile",
    state,
    nonce,
  });
  const authorizationUrl = buildAuthorizationUrl(config, params);
  return { authorizationUrl, state, nonce };
};

export const getTokens = captureAsync(
  "getTokens",
  async (opts: { currentURL: URL; state?: string; nonce?: string }) => {
    const { currentURL, state, nonce } = opts;
    return await authorizationCodeGrant(config, currentURL, {
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
  },
);

export const buildLogoutURL = () => {
  return buildEndSessionUrl(config, {
    client_id: authClientID,
    logout_uri: new URL("/", originURL).toString(),
  });
};

import { captureAsync } from "@tasan/common/tracing";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  discovery,
  randomNonce,
  randomState,
  type TokenEndpointResponse,
  type TokenEndpointResponseHelpers,
} from "openid-client";

import { authClientSecret } from "~/.server/secrets";
import { authClientID, authDisable, authServerURL, originURL } from "~/config";

const config =
  authDisable ? null : (
    await discovery(authServerURL, authClientID, authClientSecret)
  );

const callbackURL = () => new URL("/auth-callback", originURL);

export const buildAuthorizationURL = () => {
  if (!config) throw new Error("Auth is disabled");
  const state = randomState();
  const nonce = randomNonce();
  // Parameters documented here: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html#get-authorize
  const params = new URLSearchParams({
    response_type: "code",
    client_id: authClientID,
    redirect_uri: callbackURL().href,
    scope: "openid email profile",
    state,
    nonce,
  });
  const authorizationUrl = buildAuthorizationUrl(config, params);
  return { authorizationUrl, state, nonce };
};

export const getTokens = captureAsync(
  "getTokens",
  async (opts: {
    currentURL: URL;
    state: string;
    nonce: string;
  }): Promise<TokenEndpointResponse & TokenEndpointResponseHelpers> => {
    if (!config) throw new Error("Auth is disabled");
    const { currentURL, state, nonce } = opts;
    // The Lambda request URL uses the internal origin, not the public host.
    const publicCallbackURL = callbackURL();
    publicCallbackURL.search = currentURL.search;
    return await authorizationCodeGrant(config, publicCallbackURL, {
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
  },
);

export const buildLogoutURL = (): URL => {
  if (!config) throw new Error("Auth is disabled");
  return buildEndSessionUrl(config, {
    client_id: authClientID,
    logout_uri: new URL("/", originURL).toString(),
  });
};

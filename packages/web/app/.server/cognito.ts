import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { captureAsync } from "@tasan/common/tracing";

import { authServerURL } from "~/config";

// AUTH_SERVER_URL is https://cognito-idp.<region>.amazonaws.com/<userPoolID>.
const userPoolID = authServerURL.pathname.slice(1);
const region = userPoolID.split("_")[0];

let _client: CognitoIdentityProviderClient | undefined;
const client = () => {
  // Checks run inside requests, so fail fast and let the next request retry.
  _client ??= new CognitoIdentityProviderClient({
    region,
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 },
  });
  return _client;
};

/**
 * Whether the Cognito account still exists and is enabled. Throws on
 * transient failures so callers can avoid treating outages as revocation.
 */
export const isCognitoUserActive = captureAsync(
  "isCognitoUserActive",
  async (username: string): Promise<boolean> => {
    try {
      const user = await client().send(
        new AdminGetUserCommand({ UserPoolId: userPoolID, Username: username }),
      );
      return user.Enabled === true;
    } catch (error) {
      if (error instanceof UserNotFoundException) return false;
      throw error;
    }
  },
);

import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { captureAsync } from "@tasan/data";

import { appEnv } from "~/config";

const client = new SSMClient();

const toSSMSecretName = (name: string): string =>
  `/tasan-app/${name.toLowerCase().replaceAll("_", "-")}`;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const getSecrets = captureAsync(
  "getSecrets",
  async (secretNames: string[]): Promise<string[]> => {
    if (appEnv === "local") {
      const secrets = [];
      for (const name of secretNames) {
        const secret = process.env[name];
        if (secret) secrets.push(secret);
        else throw new Error(`Secret ${name} not found`);
      }
      return secrets;
    }

    const Names = secretNames.map(toSSMSecretName);
    const cmd = new GetParametersCommand({ Names, WithDecryption: true });
    const res = await client.send(cmd);
    if (res.InvalidParameters?.length) {
      console.error("Failed to get secrets", {
        InvalidParameters: res.InvalidParameters,
      });
      throw new Error(`Secrets ${res.InvalidParameters.join(", ")} not found`);
    }
    return res.Parameters?.map((p) => p.Value).filter(isDefined) ?? [];
  },
);

const [authClientSecret, cookieSignSecret] = await getSecrets([
  "AUTH_CLIENT_SECRET",
  "COOKIE_SIGN_SECRET",
]);

// TODO: expand to support multiple secrets. First item is used for cookie signing.
const cookieSignSecrets = [cookieSignSecret];

export { authClientSecret, cookieSignSecrets };

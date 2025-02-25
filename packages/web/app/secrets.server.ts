import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { captureAsync } from "@tasan/data";

import { appEnv } from "~/config";

const client = new SSMClient();

const getSecret = captureAsync(
  "getSecret",
  async (name: string): Promise<string> => {
    if (appEnv === "local") {
      const secret = process.env[name];
      if (secret) return secret;
      throw new Error(`Secret ${name} not found`);
    }

    const Name = `/tasan-app/${name.toLowerCase().replaceAll("_", "-")}`;
    const cmd = new GetParameterCommand({ Name, WithDecryption: true });
    const res = await client.send(cmd);
    if (res.Parameter?.Value) return res.Parameter.Value;
    console.log("Failed to get secret", { Name, metadata: res.$metadata });
    throw new Error(`Secret ${Name} not found`);
  },
);

export const authClientSecret = await getSecret("AUTH_CLIENT_SECRET");

// TODO: expand to support multiple secrets. First item is used for cookie signing.
export const cookieSignSecrets = [await getSecret("COOKIE_SIGN_SECRET")];

import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { Handler } from "aws-lambda";

const sourceRegion = "eu-central-1";
const destinationRegions = ["ap-southeast-1", "us-east-2"];
const parameterNames = [
  "/tasan-app/auth-client-secret",
  "/tasan-app/cookie-sign-secret",
];

interface ParameterSource {
  getParameter: (name: string) => Promise<string | undefined>;
}

interface ParameterDestination {
  putSecureParameter: (name: string, value: string) => Promise<void>;
}

export const syncParameters = async (
  source: ParameterSource,
  destinations: ParameterDestination[],
) => {
  const parameters: { name: string; value: string }[] = [];
  for (const name of parameterNames) {
    const value = await source.getParameter(name);
    if (value === undefined)
      throw new Error(`Source parameter ${name} is missing`);
    parameters.push({ name, value });
  }

  for (const destination of destinations) {
    for (const { name, value } of parameters) {
      await destination.putSecureParameter(name, value);
    }
  }
};

const sourceClient = new SSMClient({ region: sourceRegion });

const source: ParameterSource = {
  getParameter: async (name) => {
    const response = await sourceClient.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    return response.Parameter?.Value;
  },
};

const destinations = destinationRegions.map((region) => {
  const client = new SSMClient({ region });
  return {
    putSecureParameter: async (name: string, value: string) => {
      await client.send(
        new PutParameterCommand({
          Name: name,
          Value: value,
          Type: "SecureString",
          Overwrite: true,
        }),
      );
    },
  };
});

export const handler: Handler = async () => {
  await syncParameters(source, destinations);
  return { synced: parameterNames, regions: destinationRegions };
};

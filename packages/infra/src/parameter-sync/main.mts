import {
  GetParametersByPathCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { Handler } from "aws-lambda";

const sourceRegion = "eu-central-1";
const destinationRegions = ["ap-southeast-1", "us-east-2"];
const parameterPath = "/tasan-app";
const maxConcurrentWrites = 10;

type ParameterType = "String" | "StringList" | "SecureString";

interface Parameter {
  name: string;
  value: string;
  type: ParameterType;
}

interface ParameterPage {
  parameters: Parameter[];
  nextToken?: string;
}

interface ParameterSource {
  getParametersPage: (nextToken?: string) => Promise<ParameterPage>;
}

interface ParameterDestination {
  putParameter: (parameter: Parameter) => Promise<void>;
}

export const syncParameters = async (
  source: ParameterSource,
  destinations: ParameterDestination[],
) => {
  const parameters: Parameter[] = [];
  let nextToken: string | undefined;
  do {
    const page = await source.getParametersPage(nextToken);
    parameters.push(...page.parameters);
    nextToken = page.nextToken;
  } while (nextToken);

  if (parameters.length === 0)
    throw new Error(`No source parameters found under ${parameterPath}`);

  const writes = destinations.flatMap((destination) =>
    parameters.map((parameter) => () => destination.putParameter(parameter)),
  );
  for (let index = 0; index < writes.length; index += maxConcurrentWrites) {
    await Promise.all(
      writes.slice(index, index + maxConcurrentWrites).map((write) => write()),
    );
  }

  return parameters.length;
};

const sourceClient = new SSMClient({ region: sourceRegion });

const source: ParameterSource = {
  getParametersPage: async (nextToken) => {
    const response = await sourceClient.send(
      new GetParametersByPathCommand({
        Path: parameterPath,
        MaxResults: 10,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );
    return {
      parameters: (response.Parameters ?? []).map((parameter) => {
        const { Name, Type, Value } = parameter;
        if (Name === undefined || Type === undefined || Value === undefined)
          throw new Error(
            "Source parameter is missing its name, type, or value",
          );
        return { name: Name, type: Type, value: Value };
      }),
      nextToken: response.NextToken,
    };
  },
};

const destinations = destinationRegions.map((region) => {
  const client = new SSMClient({ region });
  return {
    putParameter: async ({ name, type, value }: Parameter) => {
      await client.send(
        new PutParameterCommand({
          Name: name,
          Value: value,
          Type: type,
          Overwrite: true,
        }),
      );
    },
  };
});

export const handler: Handler = async () => {
  const synced = await syncParameters(source, destinations);
  return { synced, path: parameterPath, regions: destinationRegions };
};

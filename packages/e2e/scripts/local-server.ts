import { spawn } from "node:child_process";

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

import { localUsers } from "../users.ts";

// Serves the built web app against the Compose DynamoDB Local instance.
// The table is recreated on every start, so no cleanup is needed on exit.
const endpoint = "http://127.0.0.1:8001";
const TableName = "TasanE2E";

Object.assign(process.env, {
  APP_ENV: "local",
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: "4173",
  ORIGIN_URL: "http://127.0.0.1:4173",
  AUTH_DISABLE: "true",
  AUTH_SERVER_URL: "http://127.0.0.1:4173",
  AUTH_CLIENT_ID: "e2e",
  AUTH_CLIENT_SECRET: "e2e",
  COOKIE_SIGN_SECRET: "e2e",
  AWS_ACCESS_KEY_ID: "e2e",
  AWS_SECRET_ACCESS_KEY: "e2e",
  AWS_SESSION_TOKEN: "",
  AWS_REGION: "eu-central-1",
  AWS_ENDPOINT_URL: endpoint,
  TABLE_NAME: TableName,
});

const client = new DynamoDBClient({});

async function deleteTable() {
  try {
    await client.send(new DeleteTableCommand({ TableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
}

await deleteTable();

await client.send(
  new CreateTableCommand({
    TableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI-SK-PK",
        KeySchema: [
          { AttributeName: "sk", KeyType: "HASH" },
          { AttributeName: "pk", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "KEYS_ONLY" },
      },
    ],
  }),
);
client.destroy();

// Imported after the environment is set because these modules read it on load.
const { asUserID } = await import("@tasan/common/id");
const { putUser } = await import("@tasan/data");
for (const user of Object.values(localUsers))
  await putUser({ ...user, id: asUserID(user.id) });

spawn("react-router-serve", ["build/server/index.js"], {
  cwd: new URL("../../web", import.meta.url),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${new URL("./exchange-rates.ts", import.meta.url).href}`,
  },
}).once("exit", (code) => {
  process.exitCode = code ?? 1;
});

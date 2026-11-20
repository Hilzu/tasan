import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

import { localUsers } from "../users.ts";

const endpoint = new URL(
  process.env.E2E_DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8001",
);
if (
  endpoint.protocol !== "http:" ||
  endpoint.hostname !== "127.0.0.1" ||
  endpoint.username ||
  endpoint.password ||
  endpoint.pathname !== "/" ||
  endpoint.search ||
  endpoint.hash
)
  throw new Error("E2E_DYNAMODB_ENDPOINT must be a loopback HTTP origin.");

const tableName = `TasanE2E-${randomUUID()}`;
const client = new DynamoDBClient({
  endpoint: endpoint.href,
  region: "eu-central-1",
  credentials: { accessKeyId: "e2e", secretAccessKey: "e2e" },
});
const env = {
  ...process.env,
  APP_ENV: "local",
  ORIGIN_URL: "http://127.0.0.1:4173",
  AUTH_DISABLE: "true",
  AUTH_SERVER_URL: "http://127.0.0.1:4173",
  AUTH_CLIENT_ID: "e2e",
  AUTH_CLIENT_SECRET: "e2e",
  COOKIE_SIGN_SECRET: randomUUID(),
  AWS_ACCESS_KEY_ID: "e2e",
  AWS_SECRET_ACCESS_KEY: "e2e",
  AWS_SESSION_TOKEN: "",
  AWS_PROFILE: "",
  AWS_DEFAULT_PROFILE: "",
  AWS_REGION: "eu-central-1",
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_ENDPOINT_URL: endpoint.href,
  AWS_ENDPOINT_URL_DYNAMODB: endpoint.href,
  AWS_ENDPOINT_URL_SSM: endpoint.href,
  TABLE_NAME: tableName,
  HOST: "127.0.0.1",
  PORT: "4173",
  NODE_ENV: "production",
};

let child: ChildProcess | undefined;
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown.abort();
    child?.kill(signal);
  });
}

async function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  if (shutdown.signal.aborted) return;
  await new Promise<void>((resolve, reject) => {
    child = spawn("pnpm", args, {
      env: { ...env, ...extraEnv },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0 || shutdown.signal.aborted) resolve();
      else
        reject(
          new Error(`pnpm ${args.join(" ")} exited: ${String(signal ?? code)}`),
        );
    });
  });
}

async function waitForDatabase() {
  const deadline = Date.now() + 30_000;
  while (true) {
    shutdown.signal.throwIfAborted();
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(1_000),
      });
      await response.body?.cancel();
      if (response.status < 500) return;
      if (Date.now() >= deadline)
        throw new Error(
          `DynamoDB Local returned HTTP ${String(response.status)}`,
        );
    } catch (error) {
      const connectionNotReady =
        error instanceof TypeError &&
        error.cause instanceof Error &&
        "code" in error.cause &&
        ["ECONNREFUSED", "ECONNRESET", "UND_ERR_SOCKET"].includes(
          String(error.cause.code),
        );
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      if (!connectionNotReady && !timedOut) throw error;
      if (Date.now() >= deadline)
        throw new Error(
          "DynamoDB Local did not become ready within 30 seconds.",
          {
            cause: error,
          },
        );
    }
    await setTimeout(200);
  }
}

let tableCreated = false;
try {
  await waitForDatabase();
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
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
  tableCreated = true;
  await run(["--filter", "@tasan/web...", "build"]);
  if (!shutdown.signal.aborted) {
    Object.assign(process.env, env);
    const { asUserID } = await import("@tasan/common/id");
    const { putUser } = await import("@tasan/data");
    for (const user of Object.values(localUsers))
      await putUser({ ...user, id: asUserID(user.id) });
  }
  await run(
    [
      "--dir",
      "../web",
      "exec",
      "../e2e/node_modules/.bin/react-router-serve",
      "build/server/index.js",
    ],
    {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${new URL("./exchange-rates.ts", import.meta.url).href}`,
    },
  );
} finally {
  if (tableCreated)
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  client.destroy();
}

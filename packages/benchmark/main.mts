import { createHash } from "node:crypto";
import * as process from "node:process";

import {
  Architecture,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";

// The primary stack's function. SingaporeStack deploys a function with the same name in ap-southeast-1.
const region = "eu-central-1";
const functionName = "TasanAppFn";
const benchmarkUrl = "https://tasan.app/splits";

const architectures = [Architecture.arm64, Architecture.x86_64];
const memorySizes = [256, 512, 1024, 2048];

const testCount = 15;

const sessionCookie = process.env.SESSION_COOKIE;
if (!sessionCookie) throw new Error("SESSION_COOKIE env is required");

interface FunctionState {
  architecture: Architecture;
  memorySize: number;
}

const formatState = ({ architecture, memorySize }: FunctionState) =>
  `${architecture} / ${memorySize.toString()} MB`;

// Interrupting stops the benchmark but still restores the original configuration.
const abortController = new AbortController();
process.once("SIGINT", () => {
  console.error(
    "Interrupted; restoring the original configuration. Press Ctrl-C again to exit without restoring.",
  );
  abortController.abort();
});

const request = async () => {
  const start = performance.now();
  const res = await fetch(benchmarkUrl, {
    headers: { Cookie: sessionCookie },
    // An expired session redirects to the login page, which must not be measured as a success.
    redirect: "manual",
    signal: abortController.signal,
  });
  // Read the whole body so the measurement covers the full response and the connection can be reused.
  const body = await res.text();
  const duration = Math.round(performance.now() - start);
  if (res.status !== 200) {
    console.error("Error status:", res.status);
    console.error("Error headers:", res.headers);
    console.error("Error response:", body);
    throw new Error(`Unexpected response status ${res.status.toString()}`);
  }
  return duration;
};

const lambda = new LambdaClient({ region, maxAttempts: 5 });

const waitForUpdate = () =>
  waitUntilFunctionUpdatedV2(
    { client: lambda, maxWaitTime: 120 },
    { FunctionName: functionName },
  );

const getState = async (): Promise<FunctionState & { codeSha256: string }> => {
  const res = await lambda.send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  );
  const architecture = res.Architectures?.[0];
  const memorySize = res.MemorySize;
  const codeSha256 = res.CodeSha256;
  if (!architecture || !memorySize || !codeSha256) {
    throw new Error("Function configuration is missing required fields");
  }
  return { architecture, memorySize, codeSha256 };
};

// Changing the architecture requires a code update. Download the live package once so every
// update, including the restore, deploys exactly the code that was running before the benchmark.
const downloadDeployedCode = async (expectedSha256: string) => {
  const res = await lambda.send(
    new GetFunctionCommand({ FunctionName: functionName }),
  );
  const location = res.Code?.Location;
  if (!location) throw new Error("Function code location is missing");
  const codeRes = await fetch(location);
  if (!codeRes.ok) {
    throw new Error(
      `Failed to download function code: ${codeRes.status.toString()}`,
    );
  }
  const zipFile = new Uint8Array(await codeRes.arrayBuffer());
  const sha256 = createHash("sha256").update(zipFile).digest("base64");
  if (sha256 !== expectedSha256) {
    throw new Error(
      "Downloaded function code does not match the deployed CodeSha256",
    );
  }
  return zipFile;
};

await waitForUpdate();
const original = await getState();
const zipFile = await downloadDeployedCode(original.codeSha256);

const setState = async (target: FunctionState) => {
  const { architecture } = await getState();

  // Always update the configuration so the first request after it starts a new execution environment.
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      MemorySize: target.memorySize,
    }),
  );
  await waitForUpdate();

  if (architecture === target.architecture) return;
  await lambda.send(
    new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      Architectures: [target.architecture],
      ZipFile: zipFile,
    }),
  );
  await waitForUpdate();
};

const restore = async () => {
  // A failed or interrupted run may have left an update in progress.
  await waitForUpdate();
  await setState(original);
  const restored = await getState();
  if (
    restored.architecture !== original.architecture ||
    restored.memorySize !== original.memorySize ||
    restored.codeSha256 !== original.codeSha256
  ) {
    throw new Error(
      `Restore mismatch: expected ${formatState(original)} with code ${original.codeSha256}, got ${formatState(restored)} with code ${restored.codeSha256}`,
    );
  }
  console.error(`Restored ${functionName} to ${formatState(original)}`);
};

console.error(
  `Benchmarking ${functionName} in ${region}; original configuration ${formatState(original)} will be restored afterwards`,
);

try {
  console.log("Arch\tMem\tInit\tMedian\tMin\tMax");
  for (const architecture of architectures) {
    for (const memorySize of memorySizes) {
      abortController.signal.throwIfAborted();
      await setState({ architecture, memorySize });

      const initDuration = await request();

      const durations: number[] = [];
      for (let i = 0; i < testCount; i++) {
        const duration = await request();
        durations.push(duration);
      }

      durations.sort((a, b) => a - b);
      const median = durations[Math.floor(testCount / 2)];
      const min = durations[0];
      const max = durations[testCount - 1];
      const logRow = [
        architecture,
        memorySize.toString().padStart(4),
        initDuration.toString().padStart(4),
        median.toString().padStart(4),
        min.toString().padStart(4),
        max.toString().padStart(4),
      ].join("\t");
      console.log(logRow);
    }
  }
} finally {
  await restore();
}

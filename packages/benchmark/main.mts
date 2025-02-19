import {
  Architecture,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";

const architectures = [Architecture.arm64, Architecture.x86_64];
const memorySizes = [256, 512, 1024, 2048];

const testCount = 15;

const sessionCookie = process.env.SESSION_COOKIE;
if (!sessionCookie) throw new Error("SESSION_COOKIE env is required");

const request = async () => {
  const start = Date.now();
  const res = await fetch("https://tasan.app/splits", {
    headers: {
      Cookie: sessionCookie,
    },
  });
  if (!res.ok) {
    console.log("Error status:", res.status);
    console.log("Error headers:", res.headers);
    const body = await res.text();
    console.log("Error response:", body);
    throw new Error("Failed to fetch");
  }
  return Date.now() - start;
};

const lambda = new LambdaClient({ maxAttempts: 5 });

const updateFunction = async (
  architecture: Architecture,
  memorySize: number,
) => {
  const getFunctionCmd = new GetFunctionCommand({
    FunctionName: "TasanAppFn",
  });
  const res = await lambda.send(getFunctionCmd);
  const sameArch =
    res.Configuration?.Architectures?.includes(architecture) ?? false;

  const updateMemoryCmd = new UpdateFunctionConfigurationCommand({
    FunctionName: "TasanAppFn",
    MemorySize: memorySize,
  });
  await lambda.send(updateMemoryCmd);
  await waitUntilFunctionUpdatedV2(
    { client: lambda, maxWaitTime: 30 },
    { FunctionName: "TasanAppFn" },
  );

  if (sameArch) return;
  const updateArchCmd = new UpdateFunctionCodeCommand({
    FunctionName: "TasanAppFn",
    Architectures: [architecture],
    S3Bucket: "cdk-hnb659fds-assets-412381763181-eu-central-1",
    S3Key:
      "41ee3c8cd13e32f5863a4e6881d0c9d0ca0fc7a0a49a3e099c3afd1aed289be7.zip",
  });
  await lambda.send(updateArchCmd);
  await waitUntilFunctionUpdatedV2(
    { client: lambda, maxWaitTime: 30 },
    { FunctionName: "TasanAppFn" },
  );
};

console.log("Arch\tMem\tInit\tMedian\tMin\tMax");
for (const architecture of architectures) {
  for (const memorySize of memorySizes) {
    await updateFunction(architecture, memorySize);

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

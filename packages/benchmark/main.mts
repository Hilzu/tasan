import { createHash } from "node:crypto";
import * as process from "node:process";
import { setTimeout } from "node:timers/promises";

import {
  CloudWatchLogsClient,
  paginateFilterLogEvents,
} from "@aws-sdk/client-cloudwatch-logs";
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
const logGroupName = `/aws/lambda/${functionName}`;
const benchmarkUrl = "https://tasan.app/splits";
// Served from S3 by CloudFront, so it opens the connection without invoking the Lambda.
const connectionWarmupUrl = "https://tasan.app/favicon.ico";

const architectures = [Architecture.arm64, Architecture.x86_64];
// CPU share scales linearly with memory up to one full vCPU at 1769 MB. The single-threaded
// request path gains little above that, so 2048 MB is included only to confirm the plateau.
const memorySizes = [256, 512, 768, 1024, 1280, 1536, 1769, 2048];

// Each round visits every configuration in a new random order so drift over time is spread evenly.
const rounds = 3;
const samplesPerRound = 20;
// Discarded requests after each configuration change, which absorb the cold start and JIT warm-up.
const warmupCount = 5;

// First-tier on-demand duration prices in eu-central-1 (USD per GB-second). The per-request
// charge is the same for every configuration and is left out.
const pricePerGbSecond: Record<Architecture, number> = {
  [Architecture.arm64]: 0.0000133334,
  [Architecture.x86_64]: 0.0000166667,
};

// CloudWatch Logs can take a while to deliver the last reports after the run.
const reportTimeoutMs = 3 * 60 * 1000;
const reportPollIntervalMs = 15 * 1000;

const sessionCookie = process.env.SESSION_COOKIE;
if (!sessionCookie) throw new Error("SESSION_COOKIE env is required");

interface FunctionState {
  architecture: Architecture;
  memorySize: number;
}

interface Sample extends FunctionState {
  time: string;
  round: number;
  requestId: string;
  cache: string;
  clientMs: number;
}

interface LambdaReport {
  durationMs: number;
  billedDurationMs: number;
  maxMemoryUsedMB: number;
}

const formatState = ({ architecture, memorySize }: FunctionState) =>
  `${architecture} / ${memorySize.toString()} MB`;

// Interrupting stops the benchmark but still restores the original configuration and reports
// the samples collected so far.
const abortController = new AbortController();
process.once("SIGINT", () => {
  console.error(
    "Interrupted; restoring the original configuration. Press Ctrl-C again to exit without restoring.",
  );
  abortController.abort();
});

const warmConnection = async () => {
  const res = await fetch(connectionWarmupUrl, {
    signal: abortController.signal,
  });
  await res.arrayBuffer();
  if (!res.ok) {
    throw new Error(
      `Connection warm-up failed with status ${res.status.toString()}`,
    );
  }
};

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
  const clientMs = performance.now() - start;
  if (res.status !== 200) {
    console.error("Error status:", res.status);
    console.error("Error headers:", res.headers);
    console.error("Error response:", body);
    throw new Error(`Unexpected response status ${res.status.toString()}`);
  }
  const cache = res.headers.get("x-cache") ?? "";
  if (!cache.startsWith("Miss")) {
    throw new Error(`Response was not served by the Lambda: x-cache ${cache}`);
  }
  const requestId = res.headers.get("x-amzn-requestid");
  if (!requestId) throw new Error("Response is missing x-amzn-requestid");
  return { requestId, cache, clientMs };
};

const lambda = new LambdaClient({ region, maxAttempts: 5 });
const logs = new CloudWatchLogsClient({ region, maxAttempts: 5 });

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

  // Always update the configuration so measurements start from a new execution environment.
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

const shuffle = <T,>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const configurations: FunctionState[] = architectures.flatMap((architecture) =>
  memorySizes.map((memorySize) => ({ architecture, memorySize })),
);

const runBenchmark = async (samples: Sample[]) => {
  for (let round = 1; round <= rounds; round++) {
    for (const [index, configuration] of shuffle(configurations).entries()) {
      if (abortController.signal.aborted) return;
      console.error(
        `Round ${round.toString()}/${rounds.toString()}, configuration ${(index + 1).toString()}/${configurations.length.toString()}: ${formatState(configuration)}`,
      );
      await setState(configuration);

      await warmConnection();
      for (let i = 0; i < warmupCount; i++) await request();

      for (let i = 0; i < samplesPerRound; i++) {
        const time = new Date().toISOString();
        samples.push({ ...configuration, time, round, ...(await request()) });
      }
    }
  }
};

const parseReport = (
  message: string,
): [requestId: string, report: LambdaReport] | undefined => {
  const { record } = JSON.parse(message) as {
    record?: {
      requestId?: unknown;
      metrics?: Partial<Record<keyof LambdaReport, unknown>>;
    };
  };
  const requestId = record?.requestId;
  const metrics = record?.metrics;
  if (typeof requestId !== "string" || !metrics) return;
  const { durationMs, billedDurationMs, maxMemoryUsedMB } = metrics;
  if (
    typeof durationMs !== "number" ||
    typeof billedDurationMs !== "number" ||
    typeof maxMemoryUsedMB !== "number"
  ) {
    return;
  }
  return [requestId, { durationMs, billedDurationMs, maxMemoryUsedMB }];
};

// Collects the Lambda platform reports (JSON log format) for the measured requests.
const fetchReports = async (requestIds: Set<string>, startTime: number) => {
  const reports = new Map<string, LambdaReport>();
  const deadline = Date.now() + reportTimeoutMs;
  while (true) {
    const pages = paginateFilterLogEvents(
      { client: logs },
      {
        logGroupName,
        filterPattern: '{ $.type = "platform.report" }',
        startTime,
        endTime: Date.now(),
      },
    );
    for await (const page of pages) {
      for (const event of page.events ?? []) {
        const parsed = event.message ? parseReport(event.message) : undefined;
        if (parsed && requestIds.has(parsed[0])) {
          reports.set(...parsed);
        }
      }
    }

    const missing = requestIds.size - reports.size;
    if (missing === 0) return reports;
    if (Date.now() >= deadline) {
      console.error(
        `${missing.toString()} Lambda reports were not found; their server-side columns are empty`,
      );
      return reports;
    }
    console.error(`Waiting for ${missing.toString()} Lambda reports…`);
    await setTimeout(reportPollIntervalMs);
  }
};

const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

const summarize = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    mean,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
};

const formatTable = (header: string[], rows: string[][]) => {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)),
  );
  const formatRow = (row: string[]) =>
    row
      .map((cell, column) =>
        column === 0 ?
          cell.padEnd(widths[column])
        : cell.padStart(widths[column]),
      )
      .join("  ");
  return [formatRow(header), ...rows.map(formatRow)].join("\n");
};

const printTsv = (samples: Sample[], reports: Map<string, LambdaReport>) => {
  const columns = [
    "time",
    "round",
    "architecture",
    "memoryMB",
    "requestId",
    "xCache",
    "clientMs",
    "durationMs",
    "billedDurationMs",
    "maxMemoryUsedMB",
    "codeSha256",
  ];
  const lines = [columns.join("\t")];
  for (const sample of samples) {
    const report = reports.get(sample.requestId);
    lines.push(
      [
        sample.time,
        sample.round.toString(),
        sample.architecture,
        sample.memorySize.toString(),
        sample.requestId,
        sample.cache,
        sample.clientMs.toFixed(1),
        report?.durationMs.toString() ?? "",
        report?.billedDurationMs.toString() ?? "",
        report?.maxMemoryUsedMB.toString() ?? "",
        original.codeSha256,
      ].join("\t"),
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
};

const printSummary = (
  samples: Sample[],
  reports: Map<string, LambdaReport>,
) => {
  const header = [
    "Config",
    "n",
    "Client p50",
    "p90",
    "p95",
    "mean",
    "Lambda p50",
    "p95",
    "mean",
    "Billed mean",
    "Max mem",
    "Duration $/1M",
  ];
  const rows: string[][] = [];
  for (const configuration of configurations) {
    const configSamples = samples.filter(
      (sample) =>
        sample.architecture === configuration.architecture &&
        sample.memorySize === configuration.memorySize,
    );
    if (configSamples.length === 0) continue;
    const client = summarize(configSamples.map((sample) => sample.clientMs));
    const configReports = configSamples.flatMap((sample) => {
      const report = reports.get(sample.requestId);
      return report ? [report] : [];
    });
    const ms = (value: number) => value.toFixed(1);
    const server = configReports.length > 0 && {
      duration: summarize(configReports.map((report) => report.durationMs)),
      billed: summarize(configReports.map((report) => report.billedDurationMs)),
      memory: summarize(configReports.map((report) => report.maxMemoryUsedMB)),
    };
    const costPerMillion =
      server &&
      (server.billed.mean / 1000) *
        (configuration.memorySize / 1024) *
        pricePerGbSecond[configuration.architecture] *
        1_000_000;
    rows.push([
      formatState(configuration),
      configSamples.length.toString(),
      ms(client.p50),
      ms(client.p90),
      ms(client.p95),
      ms(client.mean),
      server ? ms(server.duration.p50) : "-",
      server ? ms(server.duration.p95) : "-",
      server ? ms(server.duration.mean) : "-",
      server ? ms(server.billed.mean) : "-",
      server ? `${server.memory.max.toString()} MB` : "-",
      costPerMillion ? `$${costPerMillion.toFixed(2)}` : "-",
    ]);
  }
  console.error(`\n${formatTable(header, rows)}`);
  console.error(
    "\nClient times are measured end to end from this machine; Lambda times come from the function's platform reports.",
  );
};

console.error(
  `Benchmarking ${functionName} in ${region}; original configuration ${formatState(original)} will be restored afterwards`,
);

const samples: Sample[] = [];
const startTime = Date.now();
try {
  await runBenchmark(samples);
} catch (error) {
  if (!abortController.signal.aborted) throw error;
} finally {
  await restore();
}

if (samples.length === 0) {
  console.error("No samples were collected");
} else {
  const reports = await fetchReports(
    new Set(samples.map((sample) => sample.requestId)),
    startTime,
  );
  printTsv(samples, reports);
  printSummary(samples, reports);
}

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  return 1;
};

const run = (responsePath) => {
  const invocation = spawnSync(
    "aws",
    [
      "lambda",
      "invoke",
      "--function-name",
      "TasanParameterSyncFn",
      "--region",
      "eu-central-1",
      "--cli-binary-format",
      "raw-in-base64-out",
      "--payload",
      "{}",
      "--output",
      "json",
      responsePath,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (invocation.error)
    return fail(
      `Could not invoke parameter sync Lambda: ${invocation.error.message}`,
    );
  if (invocation.status === null)
    return fail(
      `Parameter sync Lambda invocation terminated: ${invocation.signal}`,
    );
  if (invocation.status !== 0) return invocation.status;

  let metadata;
  try {
    metadata = JSON.parse(invocation.stdout);
  } catch {
    return fail("Invalid response from the parameter sync Lambda invocation");
  }
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    metadata.StatusCode !== 200
  )
    return fail("Invalid response from the parameter sync Lambda invocation");
  if (!Object.hasOwn(metadata, "FunctionError")) return 0;

  let detail = "Unrecognized Lambda error response";
  try {
    const response = JSON.parse(readFileSync(responsePath, "utf8"));
    if (response !== null && typeof response === "object") {
      // Only messages constructed by the sync function are safe to show in CI.
      if (
        response.errorType === "ParameterSyncError" &&
        typeof response.errorMessage === "string"
      )
        detail = response.errorMessage;
      else if (
        typeof response.errorType === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(response.errorType)
      )
        detail = response.errorType;
    }
  } catch {
    detail = "Unreadable or invalid Lambda error response";
  }
  return fail(
    `Parameter Store sync failed: ${detail}. See CloudWatch Logs /aws/lambda/TasanParameterSyncFn in eu-central-1 for details.`,
  );
};

const directory = mkdtempSync(join(tmpdir(), "tasan-sync-"));
const responsePath = join(directory, "response.json");
try {
  process.exitCode = run(responsePath);
} finally {
  rmSync(responsePath, { force: true });
  rmdirSync(directory);
}

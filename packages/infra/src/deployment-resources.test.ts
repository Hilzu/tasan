import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/resolve-deployment-resources.sh", import.meta.url),
);

const discover = (
  bucket: string,
  distribution: string,
  exitCode = "0",
): ReturnType<typeof spawnSync> => {
  const directory = mkdtempSync(join(tmpdir(), "tasan-discovery-"));
  try {
    writeFileSync(
      join(directory, "aws"),
      `#!/usr/bin/env bash
set -euo pipefail
[[ "$1 $2" == "cloudformation list-stack-resources" ]]
[[ "$*" == *"--stack-name TasanStack --region eu-central-1"* ]]
[[ "$*" == *'ResourceStatus != \`DELETE_COMPLETE\`'* ]]
if [[ "$MOCK_EXIT_CODE" != 0 ]]; then
  echo "CloudFormation lookup failed" >&2
  exit "$MOCK_EXIT_CODE"
fi
if [[ "$*" == *'AWS::S3::Bucket'* && "$*" == *'AppAssetsBucket'* ]]; then
  printf '%s' "$MOCK_BUCKET"
elif [[ "$*" == *'AWS::CloudFront::Distribution'* && "$*" == *'AppDistribution'* ]]; then
  printf '%s' "$MOCK_DISTRIBUTION"
else
  exit 99
fi
`,
      { mode: 0o755 },
    );
    return spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        MOCK_BUCKET: bucket,
        MOCK_DISTRIBUTION: distribution,
        MOCK_EXIT_CODE: exitCode,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

await test("discovery emits the deployed bucket and distribution for GitHub environment loading", () => {
  const result = discover("tasan-assets-bucket", "E1234567890");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    result.stdout,
    "ASSETS_BUCKET_NAME=tasan-assets-bucket\nCLOUDFRONT_DISTRIBUTION_ID=E1234567890\n",
  );
});

await test("missing resources stop discovery without exporting any values", () => {
  for (const [bucket, distribution] of [
    ["", "E1234567890"],
    ["None", "E1234567890"],
    ["tasan-assets-bucket", ""],
    ["tasan-assets-bucket", "None"],
  ]) {
    const result = discover(bucket, distribution);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(String(result.stderr), /Expected exactly one application/);
  }
});

await test("ambiguous resources stop discovery instead of picking the first match", () => {
  for (const [bucket, distribution] of [
    ["tasan-assets-one\ttasan-assets-two", "E1234567890"],
    ["tasan-assets-bucket", "E1234567890\nE9876543210"],
  ]) {
    const result = discover(bucket, distribution);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
  }
});

await test("invalid resource IDs cannot inject additional GitHub environment variables", () => {
  const result = discover("tasan-assets-bucket", "E1234567890\nINJECTED=value");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});

await test("CloudFormation lookup failures propagate without exporting any values", () => {
  const result = discover("tasan-assets-bucket", "E1234567890", "42");
  assert.equal(result.status, 42);
  assert.equal(result.stdout, "");
  assert.match(String(result.stderr), /CloudFormation lookup failed/);
});

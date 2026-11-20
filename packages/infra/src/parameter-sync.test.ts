import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";

import { getLogger } from "@tasan/common/logging";

import { syncParameters } from "./parameter-sync/main.mjs";

await test("copies all paginated parameters to each region concurrently", async () => {
  const parameters = [
    {
      name: "/tasan-app/auth-client-secret",
      type: "SecureString" as const,
      value: "auth-secret",
    },
    {
      name: "/tasan-app/cookie-sign-secret",
      type: "SecureString" as const,
      value: "cookie-secret",
    },
    {
      name: "/tasan-app/allowed-hosts",
      type: "StringList" as const,
      value: "tasan.app,localhost",
    },
    {
      name: "/tasan-app/setting",
      type: "String" as const,
      value: "setting",
    },
    {
      name: "/tasan-app/feature-flag",
      type: "String" as const,
      value: "enabled",
    },
    {
      name: "/tasan-app/feature-list",
      type: "StringList" as const,
      value: "one,two",
    },
  ];
  const nextTokens: (string | undefined)[] = [];
  const written: (typeof parameters)[] = [[], []];
  let activeWrites = 0;
  let maxActiveWrites = 0;

  const count = await syncParameters(
    {
      getParametersPage: (nextToken) => {
        nextTokens.push(nextToken);
        return Promise.resolve(
          nextToken === undefined ?
            { parameters: parameters.slice(0, 2), nextToken: "page-2" }
          : nextToken === "page-2" ?
            { parameters: parameters.slice(2, 4), nextToken: "page-3" }
          : { parameters: parameters.slice(4) },
        );
      },
    },
    written.map((regionWrites) => ({
      region: "test-region",
      putParameter: async (parameter) => {
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        await new Promise((resolve) => setTimeout(resolve, 1));
        regionWrites.push(parameter);
        activeWrites -= 1;
      },
    })),
  );

  assert.equal(count, parameters.length);
  assert.deepEqual(nextTokens, [undefined, "page-2", "page-3"]);
  const expected = [...parameters].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  assert.deepEqual(
    written.map((regionWrites) =>
      regionWrites.sort((left, right) => left.name.localeCompare(right.name)),
    ),
    [expected, expected],
  );
  assert.equal(maxActiveWrites, 10);
});

await test("fails without writing when the source path is empty", async () => {
  const writes: string[][] = [[], []];

  await assert.rejects(
    syncParameters(
      { getParametersPage: () => Promise.resolve({ parameters: [] }) },
      writes.map((regionWrites) => ({
        region: "test-region",
        putParameter: ({ name }) => {
          regionWrites.push(name);
          return Promise.resolve();
        },
      })),
    ),
    /No source parameters found under \/tasan-app/,
  );

  assert.deepEqual(writes, [[], []]);
});

await test("reports source permission errors without exposing their messages", async () => {
  const logged = mock.method(getLogger(), "error", () => undefined);
  const failure = Object.assign(new Error("sensitive source detail"), {
    name: "AccessDeniedException",
  });
  let wrote = false;
  try {
    await assert.rejects(
      syncParameters({ getParametersPage: () => Promise.reject(failure) }, [
        {
          region: "us-east-2",
          putParameter: () => {
            wrote = true;
            return Promise.resolve();
          },
        },
      ]),
      {
        name: "ParameterSyncError",
        message:
          "ssm:GetParametersByPath on /tasan-app in eu-central-1 failed: AccessDeniedException",
      },
    );
    assert.equal(wrote, false);
    assert.deepEqual(logged.mock.calls[0]?.arguments[1], { error: failure });
  } finally {
    logged.mock.restore();
  }
});

await test("reports the destination and error type when a write fails", async () => {
  const logged = mock.method(getLogger(), "error", () => undefined);
  const failure = Object.assign(new Error("sensitive destination detail"), {
    name: "AccessDeniedException",
  });
  try {
    await assert.rejects(
      syncParameters(
        {
          getParametersPage: () =>
            Promise.resolve({
              parameters: [
                {
                  name: "/tasan-app/example",
                  type: "SecureString",
                  value: "sensitive value",
                },
              ],
            }),
        },
        [{ region: "us-east-2", putParameter: () => Promise.reject(failure) }],
      ),
      {
        name: "ParameterSyncError",
        message: "ssm:PutParameter in us-east-2 failed: AccessDeniedException",
      },
    );
    assert.deepEqual(logged.mock.calls[0]?.arguments[1], { error: failure });
  } finally {
    logged.mock.restore();
  }
});

const syncScript = fileURLToPath(
  new URL("../../../scripts/sync-regional-parameters.mjs", import.meta.url),
);

const invokeSyncScript = (
  invocation: string,
  response: string,
  exitCode = "0",
): ReturnType<typeof spawnSync> => {
  const directory = mkdtempSync(join(tmpdir(), "tasan-sync-"));
  try {
    writeFileSync(
      join(directory, "aws"),
      `#!/usr/bin/env bash
set -euo pipefail
[[ "$1 $2" == "lambda invoke" ]]
[[ "$*" == *"--function-name TasanParameterSyncFn"* ]]
if [[ "$MOCK_EXIT_CODE" != 0 ]]; then
  echo "Lambda invocation failed" >&2
  exit "$MOCK_EXIT_CODE"
fi
for response_file in "$@"; do :; done
printf '%s' "$MOCK_RESPONSE" > "$response_file"
printf '%s' "$MOCK_INVOCATION"
`,
      { mode: 0o755 },
    );
    return spawnSync(process.execPath, [syncScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        MOCK_INVOCATION: invocation,
        MOCK_RESPONSE: response,
        MOCK_EXIT_CODE: exitCode,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

await test("the deploy sync succeeds without logging the Lambda payload", () => {
  const result = invokeSyncScript(
    JSON.stringify({ StatusCode: 200 }),
    JSON.stringify({ sensitive: "not-for-ci" }),
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

await test("the deploy sync reports safe errors and hides other payload details", () => {
  const invocation = JSON.stringify({
    StatusCode: 200,
    FunctionError: "Unhandled",
  });
  const safeDetail =
    "ssm:GetParametersByPath on /tasan-app in eu-central-1 failed: AccessDeniedException";
  for (const [response, expected] of [
    [
      JSON.stringify({
        errorType: "ParameterSyncError",
        errorMessage: safeDetail,
        trace: ["not-for-ci"],
      }),
      safeDetail,
    ],
    [
      JSON.stringify({ errorType: "Error", errorMessage: "not-for-ci" }),
      "Error",
    ],
    ["not-for-ci", "Unreadable or invalid Lambda error response"],
  ]) {
    const result = invokeSyncScript(invocation, response);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(String(result.stderr).includes(expected));
    assert.match(String(result.stderr), /CloudWatch Logs .*eu-central-1/);
    assert.doesNotMatch(String(result.stderr), /not-for-ci/);
  }
});

await test("the deploy sync rejects invalid invocation metadata and CLI failures", () => {
  const invalid = invokeSyncScript("not-json", "{}");
  assert.equal(invalid.status, 1);
  assert.match(String(invalid.stderr), /Invalid response/);

  const failure = invokeSyncScript("", "", "42");
  assert.equal(failure.status, 42);
  assert.match(String(failure.stderr), /Lambda invocation failed/);
});

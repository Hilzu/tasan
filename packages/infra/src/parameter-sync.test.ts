import assert from "node:assert/strict";
import { test } from "node:test";

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

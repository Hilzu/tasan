import assert from "node:assert/strict";
import { test } from "node:test";

import { syncParameters } from "./parameter-sync/main.mjs";

await test("copies both secrets as secure parameters", async () => {
  const values = new Map([
    ["/tasan-app/auth-client-secret", "auth-secret"],
    ["/tasan-app/cookie-sign-secret", "cookie-secret"],
  ]);
  const written: [string, string][][] = [[], []];

  await syncParameters(
    {
      getParameter: (name) => Promise.resolve(values.get(name)),
    },
    written.map((regionWrites) => ({
      putSecureParameter: (name, value) => {
        regionWrites.push([name, value]);
        return Promise.resolve();
      },
    })),
  );

  assert.deepEqual(written, [[...values], [...values]]);
});

await test("fails when a source secret is missing", async () => {
  const writes: string[][] = [[], []];

  await assert.rejects(
    syncParameters(
      {
        getParameter: (name) =>
          Promise.resolve(
            name === "/tasan-app/auth-client-secret" ? "auth-secret" : (
              undefined
            ),
          ),
      },
      writes.map((regionWrites) => ({
        putSecureParameter: (name) => {
          regionWrites.push(name);
          return Promise.resolve();
        },
      })),
    ),
    /Source parameter \/tasan-app\/cookie-sign-secret is missing/,
  );

  assert.deepEqual(writes, [[], []]);
});

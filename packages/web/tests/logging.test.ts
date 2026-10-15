import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { getLogger, logError, withLogContext } from "@tasan/common/logging";
import { RouterContextProvider } from "react-router";

import { requestLogging } from "~/.server/request-logging";
import { ApplicationError } from "~/.server/services/errors";
import { logAction } from "~/.server/services/logging";

interface LogEntry {
  level: string;
  message: string;
  requestId?: string;
  action?: string;
  outcome?: string;
  path?: string;
  userId?: string;
  status?: number;
  errorCode?: string;
  fields?: string[];
  parameters?: Record<string, unknown>;
  error?: { name: string; message: string; stack: string };
}

const captureLogs = () => {
  const entries: LogEntry[] = [];
  const capture = (chunk: unknown) => {
    entries.push(JSON.parse(String(chunk)) as LogEntry);
    return true;
  };
  const stdout = mock.method(process.stdout, "write", capture);
  const stderr = mock.method(process.stderr, "write", capture);
  return {
    entries,
    restore: () => {
      stdout.mock.restore();
      stderr.mock.restore();
    },
  };
};

await test("concurrent and subsequent requests keep their context isolated", async () => {
  const logs = captureLogs();
  try {
    await Promise.all(
      ["first", "second"].map((requestId) =>
        withLogContext({ requestId }, async () => {
          getLogger().appendKeys({ userId: requestId });
          await Promise.resolve();
          await logAction(
            "expense.delete",
            { expenseId: requestId },
            async () => {
              await Promise.resolve();
              getLogger().info("Inside action");
            },
          );
          getLogger().info("Outside action");
        }),
      ),
    );
    withLogContext({ requestId: "third" }, () => {
      getLogger().info("Next request");
    });
    for (const entry of logs.entries.filter(
      (entry) => entry.requestId !== "third",
    )) {
      assert.equal(entry.userId, entry.requestId);
      assert.equal(
        entry.action,
        entry.message === "Outside action" ? undefined : "expense.delete",
      );
    }
    const last = logs.entries.at(-1);
    assert.ok(last);
    assert.equal(last.userId, undefined);
    assert.equal(last.action, undefined);
  } finally {
    logs.restore();
  }
});

await test("actions distinguish rejection from failure and serialize errors once per request", async () => {
  const logs = captureLogs();
  const error = new Error("Database unavailable", {
    cause: new Error("Connection failed"),
  });
  try {
    await withLogContext({ requestId: "failed" }, async () => {
      await assert.rejects(
        logAction("expense.create", {}, () => Promise.reject(error)),
        error,
      );
      logError("Request failed", error);
      const invalid = new ApplicationError("invalid_input", "Invalid amount", {
        amount: ["Invalid"],
      });
      await assert.rejects(
        logAction("expense.create", {}, () => Promise.reject(invalid)),
        invalid,
      );
    });
    const failures = logs.entries.filter((entry) => entry.level === "ERROR");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].outcome, "failure");
    assert.equal(failures[0].error?.name, "Error");
    assert.equal(failures[0].error.message, error.message);
    assert.ok(failures[0].error.stack);
    const rejected = logs.entries.find((entry) => entry.outcome === "rejected");
    assert.equal(rejected?.level, "INFO");
    assert.equal(rejected.errorCode, "invalid_input");
    assert.deepEqual(rejected.fields, ["amount"]);
    withLogContext({ requestId: "next" }, () => {
      logError("Request failed", error);
    });
    assert.equal(
      logs.entries.filter((entry) => entry.level === "ERROR").length,
      2,
    );
  } finally {
    logs.restore();
  }
});

await test("request logs redact invite credentials and queries, preserve Lambda IDs, and record status", async () => {
  const logs = captureLogs();
  try {
    const request = new Request(
      "https://tasan.app/accept-invite/secret-invite.data?code=secret-code",
      {
        headers: {
          cookie: "secret-cookie",
          authorization: "Bearer secret-token",
        },
      },
    );
    await withLogContext({ requestId: "lambda-id" }, () =>
      requestLogging(
        {
          request,
          params: {},
          pattern: "/accept-invite/:inviteID",
          url: new URL(request.url),
          context: new RouterContextProvider(),
        },
        () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { "set-cookie": "secret-response" },
            }),
          ),
      ),
    );
    assert.equal(logs.entries.length, 2);
    assert.ok(logs.entries.every((entry) => entry.requestId === "lambda-id"));
    assert.equal(logs.entries[0].path, "/accept-invite/[redacted]");
    assert.equal(logs.entries[1].status, 302);
    assert.ok(!JSON.stringify(logs.entries).includes("secret-"));
  } finally {
    logs.restore();
  }
});

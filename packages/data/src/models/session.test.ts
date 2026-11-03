import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { genSessionID, genUserID } from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const { getSession, refreshSession } = await import("./session.js");

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

await test("session reads recover after a transient database failure", async () => {
  const id = genSessionID();
  const userID = genUserID();
  const failure = new Error("Temporary DynamoDB failure");
  let calls = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    assert.ok(command instanceof GetCommand);
    assert.deepEqual(command.input.Key, { pk: id, sk: id });
    if (++calls === 1) return Promise.reject(failure);
    return Promise.resolve({
      Item: {
        pk: id,
        sk: id,
        forUser: userID,
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    });
  });
  await assert.rejects(getSession(id), (error) => error === failure);
  assert.equal((await getSession(id))?.userID, userID);
  assert.equal(calls, 2);
});

for (const secondsUntilExpiry of [-60, 0, 1]) {
  await test(`session expiry is enforced with ${String(secondsUntilExpiry)} seconds remaining, even before TTL deletion`, async () => {
    mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-03T12:00:00Z"),
    });
    const id = genSessionID();
    mock.method(
      DynamoDBDocumentClient.prototype,
      "send",
      (command: unknown) => {
        assert.ok(command instanceof GetCommand);
        assert.equal(command.input.ConsistentRead, true);
        return Promise.resolve({
          Item: {
            pk: id,
            sk: id,
            createdAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + secondsUntilExpiry,
          },
        });
      },
    );
    assert.equal(Boolean(await getSession(id)), secondsUntilExpiry > 0);
  });
}

await test("absolute expiry is enforced even if the idle expiry is later", async () => {
  const id = genSessionID();
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.resolve({
      Item: {
        pk: id,
        sk: id,
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        absoluteExpiresAt: Math.floor(Date.now() / 1000),
      },
    }),
  );
  assert.equal(await getSession(id), undefined);
});

await test("refresh only changes expiry and requires an existing live record within its absolute deadline", async () => {
  const id = genSessionID();
  const previousExpiry = new Date(Date.now() + 1800_000);
  const expiry = new Date(Date.now() + 3600_000);
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    assert.ok(command instanceof UpdateCommand);
    assert.deepEqual(command.input.Key, { pk: id, sk: id });
    assert.equal(command.input.UpdateExpression, "SET expiresAt = :expiry");
    assert.equal(
      command.input.ConditionExpression,
      "attribute_exists(pk) AND expiresAt > :now AND expiresAt = :previousExpiry AND expiresAt < :expiry AND (attribute_not_exists(absoluteExpiresAt) OR absoluteExpiresAt >= :expiry)",
    );
    assert.deepEqual(command.input.ExpressionAttributeValues, {
      ":now": Math.floor(Date.now() / 1000),
      ":expiry": Math.floor(expiry.getTime() / 1000),
      ":previousExpiry": Math.floor(previousExpiry.getTime() / 1000),
    });
    return Promise.resolve({});
  });
  assert.equal(await refreshSession(id, expiry, previousExpiry), true);
});

await test("logout, concurrent renewal and expired records cannot be resurrected by renewal", async () => {
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(
      new ConditionalCheckFailedException({
        $metadata: {},
        message: "Condition failed",
      }),
    ),
  );
  assert.equal(
    await refreshSession(
      genSessionID(),
      new Date(Date.now() + 3600_000),
      new Date(Date.now() + 1800_000),
    ),
    false,
  );
});

await test("renewal propagates database failures and refuses a past deadline without a write", async () => {
  const failure = new Error("Database unavailable");
  const send = mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(failure),
  );
  assert.equal(
    await refreshSession(
      genSessionID(),
      new Date(Date.now()),
      new Date(Date.now() - 3600_000),
    ),
    false,
  );
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(
    refreshSession(
      genSessionID(),
      new Date(Date.now() + 3600_000),
      new Date(Date.now() + 1800_000),
    ),
    (error) => error === failure,
  );
});

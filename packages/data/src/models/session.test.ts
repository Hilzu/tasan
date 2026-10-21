import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { genSessionID, genUserID } from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const { getSession } = await import("./session.js");

afterEach(() => {
  mock.restoreAll();
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

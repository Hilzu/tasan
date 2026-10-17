import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { genUserID } from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const { putUser } = await import("./user.js");

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

await test("profile writes atomically initialize createdAt without overwriting it", async () => {
  const now = new Date("2026-10-17T00:00:00.000Z");
  mock.timers.enable({ apis: ["Date"], now });
  const user = { id: genUserID(), name: "Alice", email: "alice@example.com" };
  const send = mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    (command: unknown) => {
      assert.ok(command instanceof UpdateCommand);
      assert.deepEqual(command.input, {
        TableName: "TestTable",
        Key: { pk: user.id, sk: user.id },
        UpdateExpression:
          "SET #name = :name, email = :email, createdAt = if_not_exists(createdAt, :now)",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: {
          ":name": user.name,
          ":email": user.email,
          ":now": now.toISOString(),
        },
      });
      return Promise.resolve({});
    },
  );

  await putUser(user);
  assert.equal(send.mock.callCount(), 1);
});

await test("profile write failures propagate to the caller", async () => {
  const error = new Error("Write failed");
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(
    putUser({ id: genUserID(), name: "Alice", email: "alice@example.com" }),
    error,
  );
});

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

await test("locale updates and resets change only the preference on an existing profile", async () => {
  const { setUserLocale } = await import("./user.js");
  const userID = genUserID();
  const send = mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    (command: unknown) => {
      assert.ok(command instanceof UpdateCommand);
      const {
        Key,
        ConditionExpression,
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      } = command.input;
      assert.deepEqual(Key, { pk: userID, sk: userID });
      assert.equal(ConditionExpression, "attribute_exists(pk)");
      assert.deepEqual(ExpressionAttributeNames, { "#locale": "locale" });
      assert.ok(
        UpdateExpression === "SET #locale = :locale" ||
          UpdateExpression === "REMOVE #locale",
      );
      assert.equal(UpdateExpression.includes("createdAt"), false);
      assert.equal(UpdateExpression.includes("email"), false);
      assert.equal(UpdateExpression.includes("#name"), false);
      if (UpdateExpression.startsWith("SET"))
        assert.deepEqual(ExpressionAttributeValues, { ":locale": "fi-FI" });
      else assert.equal(ExpressionAttributeValues, undefined);
      return Promise.resolve({});
    },
  );
  await setUserLocale(userID, "fi-FI");
  await setUserLocale(userID, undefined);
  assert.equal(send.mock.callCount(), 2);
});

await test("profile reads preserve optional locale and request strong consistency only when needed", async () => {
  const { getUser } = await import("./user.js");
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
  const user = {
    id: genUserID(),
    name: "Alice",
    email: "alice@example.com",
    locale: "fi-FI",
  };
  const reads: boolean[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    assert.ok(command instanceof GetCommand);
    reads.push(command.input.ConsistentRead ?? false);
    return Promise.resolve({
      Item: {
        pk: user.id,
        sk: user.id,
        name: user.name,
        email: user.email,
        locale: user.locale,
        createdAt: new Date().toISOString(),
      },
    });
  });
  assert.deepEqual(await getUser(user.id), user);
  assert.deepEqual(await getUser(user.id, { consistentRead: true }), user);
  assert.deepEqual(reads, [false, true]);
});

await test("locale update failures propagate rather than creating or replacing a profile", async () => {
  const { setUserLocale } = await import("./user.js");
  const error = new Error("ConditionalCheckFailedException");
  const send = mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(setUserLocale(genUserID(), "fi-FI"), error);
  assert.equal(send.mock.callCount(), 1);
});

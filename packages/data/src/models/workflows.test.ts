import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { genInviteID, genSplitID, genUserID } from "@tasan/common/id";

// Import after configuration so these tests run without an AWS environment.
process.env.TABLE_NAME = "TestTable";
const { createSplit } = await import("./split.js");
const { consumeInviteForSplit } = await import("./invite-split.js");
const actorID = genUserID();
const invite = {
  id: genInviteID(),
  splitID: genSplitID(),
  createdBy: genUserID(),
  expiresAt: new Date(Date.now() + 60_000),
};

afterEach(() => {
  mock.restoreAll();
});

await test("split and owner membership are written in a single transaction", async () => {
  const commands: unknown[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    commands.push(command);
    return Promise.resolve({});
  });
  const { id } = await createSplit({
    name: "Trip",
    currency: "EUR",
    createdBy: actorID,
  });
  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof TransactWriteCommand);
  const items = commands[0].input.TransactItems;
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.ok(items[0].Put);
  assert.ok(items[1].Put);
  const ownerItem = items[1].Put.Item as Record<string, unknown>;
  assert.deepEqual(items[0].Put.Item, {
    pk: id,
    sk: id,
    name: "Trip",
    currency: "EUR",
    createdBy: actorID,
    createdAt: ownerItem.createdAt,
  });
  assert.equal(ownerItem.pk, id);
  assert.equal(ownerItem.sk, actorID);
});

await test("invitation consumption conditions deletion on expiry and preserves existing membership", async () => {
  const commands: unknown[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    commands.push(command);
    return Promise.resolve({});
  });
  assert.equal(await consumeInviteForSplit(invite, actorID), true);
  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof TransactWriteCommand);
  const items = commands[0].input.TransactItems;
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.ok(items[0].Delete);
  assert.ok(items[1].Update);
  assert.deepEqual(items[0].Delete.Key, { pk: invite.id, sk: invite.splitID });
  assert.equal(
    items[0].Delete.ConditionExpression,
    "attribute_exists(pk) AND expiresAt > :now",
  );
  assert.equal(
    typeof items[0].Delete.ExpressionAttributeValues?.[":now"],
    "number",
  );
  assert.deepEqual(items[1].Update.Key, { pk: invite.splitID, sk: actorID });
  assert.ok(items[1].Update.UpdateExpression?.includes("if_not_exists"));
});

await test("failed invite condition reports an unavailable invitation", async () => {
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(
      new TransactionCanceledException({
        $metadata: {},
        message: "Condition failed",
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
      }),
    ),
  );
  assert.equal(await consumeInviteForSplit(invite, actorID), false);
});

await test("transaction conflicts and storage failures propagate to the caller", async () => {
  const error = new TransactionCanceledException({
    $metadata: {},
    message: "Conflict",
    CancellationReasons: [{ Code: "TransactionConflict" }],
  });
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(
    () => consumeInviteForSplit(invite, actorID),
    (failure: unknown) => failure === error,
  );
});

await test("transaction failures without cancellation reasons propagate unchanged", async () => {
  const error = new TransactionCanceledException({
    $metadata: {},
    message: "Transaction failed",
    CancellationReasons: [],
  });
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(
    () => consumeInviteForSplit(invite, actorID),
    (failure: unknown) => failure === error,
  );
});

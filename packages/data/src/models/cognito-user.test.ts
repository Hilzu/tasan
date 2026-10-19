import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { asCognitoUserID, genUserID } from "@tasan/common/id";

import { DataIntegrityError } from "../errors.js";

process.env.TABLE_NAME = "TestTable";
const { ensureCognitoUser, getCognitoUser } = await import("./cognito-user.js");
const cognitoID = asCognitoUserID("cog_12345678-1234-4234-8234-123456789012");
const userID = genUserID();
const createdAt = "2025-01-01T00:00:00.000Z";
const canonical = { pk: cognitoID, sk: cognitoID, userID, createdAt };
const conditionalFailure = () =>
  new TransactionCanceledException({
    $metadata: {},
    message: "Mapping already exists",
    CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
  });

afterEach(() => {
  mock.restoreAll();
});

await test("existing fixed-key mappings use a strong read without querying or writing", async () => {
  const send = mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    (command: unknown) => {
      assert.ok(command instanceof GetCommand);
      assert.deepEqual(command.input.Key, { pk: cognitoID, sk: cognitoID });
      assert.equal(command.input.ConsistentRead, true);
      return Promise.resolve({ Item: canonical });
    },
  );
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(await getCognitoUser(cognitoID), {
    cognitoID,
    userID,
    createdAt: new Date(createdAt),
  });
});

await test("legacy mappings are upgraded once with their original user and creation time", async () => {
  const legacy = { pk: cognitoID, sk: userID, createdAt };
  let migrated: Record<string, unknown> | undefined;
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({ Item: migrated });
    if (command instanceof QueryCommand) {
      assert.equal(command.input.ConsistentRead, true);
      assert.equal(command.input.Limit, 1);
      assert.deepEqual(command.input.ExpressionAttributeValues, {
        ":pk": cognitoID,
        ":sk": "usr_",
      });
      return Promise.resolve({ Items: [legacy] });
    }
    assert.ok(command instanceof PutCommand);
    assert.deepEqual(command.input, {
      TableName: "TestTable",
      Item: canonical,
      ConditionExpression: "attribute_not_exists(pk)",
    });
    migrated = structuredClone(command.input.Item);
    writes++;
    return Promise.resolve({});
  });
  assert.deepEqual(await getCognitoUser(cognitoID), {
    cognitoID,
    userID,
    createdAt: new Date(createdAt),
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.equal(writes, 1);
  assert.deepEqual(migrated, canonical);
  assert.deepEqual(legacy, { pk: cognitoID, sk: userID, createdAt });
});

await test("concurrent legacy migrations preserve one mapping and return the same user", async () => {
  const callers = 12;
  const legacy = { pk: cognitoID, sk: userID, createdAt };
  let persisted: Record<string, unknown> | undefined;
  let readers = 0;
  let accepted = 0;
  let attempts = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async (command: unknown) => {
      if (command instanceof GetCommand) {
        assert.equal(command.input.ConsistentRead, true);
        return { Item: persisted };
      }
      if (command instanceof QueryCommand) {
        if (++readers === callers) {
          assert.ok(release);
          release();
        }
        await ready;
        return { Items: [legacy] };
      }
      assert.ok(command instanceof PutCommand);
      assert.equal(
        command.input.ConditionExpression,
        "attribute_not_exists(pk)",
      );
      assert.deepEqual(command.input.Item, canonical);
      attempts++;
      if (persisted)
        throw new ConditionalCheckFailedException({
          $metadata: {},
          message: "Already migrated",
        });
      persisted = structuredClone(command.input.Item);
      accepted++;
      return {};
    },
  );
  const results = await Promise.all(
    Array.from({ length: callers }, () => ensureCognitoUser({ cognitoID })),
  );
  assert.deepEqual(
    results,
    Array.from({ length: callers }, () => ({ userID })),
  );
  assert.equal(attempts, callers);
  assert.equal(accepted, 1);
  assert.deepEqual(persisted, canonical);
  assert.deepEqual(legacy, { pk: cognitoID, sk: userID, createdAt });
});

await test("a mapping created during legacy lookup wins over the migration candidate", async () => {
  const winner = { ...canonical, userID: genUserID() };
  let reads = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      assert.equal(command.input.ConsistentRead, true);
      return Promise.resolve(++reads === 1 ? {} : { Item: winner });
    }
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof PutCommand);
    assert.deepEqual(command.input.Item, canonical);
    return Promise.reject(
      new ConditionalCheckFailedException({
        $metadata: {},
        message: "Mapping already exists",
      }),
    );
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), {
    userID: winner.userID,
  });
  assert.equal(reads, 2);
});

await test("migration failures propagate without allocating a different user", async () => {
  for (const error of [
    new Error("Migration write failed"),
    new ConditionalCheckFailedException({
      $metadata: {},
      message: "Winner missing",
    }),
  ]) {
    const send = mock.method(
      DynamoDBDocumentClient.prototype,
      "send",
      (command: unknown) => {
        if (command instanceof GetCommand) return Promise.resolve({});
        if (command instanceof QueryCommand)
          return Promise.resolve({
            Items: [{ pk: cognitoID, sk: userID, createdAt }],
          });
        assert.ok(command instanceof PutCommand);
        return Promise.reject(error);
      },
    );
    await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
    assert.equal(
      send.mock.callCount(),
      error instanceof ConditionalCheckFailedException ? 4 : 3,
    );
    send.mock.restore();
  }
});

await test("a lost migration response can be retried without rewriting the mapping", async () => {
  const error = new Error("Response lost");
  let persisted: Record<string, unknown> | undefined;
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({ Item: persisted });
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof PutCommand);
    persisted = structuredClone(command.input.Item);
    writes++;
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.deepEqual(persisted, canonical);
  assert.equal(writes, 1);
});

await test("concurrent first logins all return the single persisted mapping", async () => {
  const callers = 12;
  let readers = 0;
  let writes = 0;
  const records: Record<string, unknown>[] = [];
  const candidates = new Set<unknown>();
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async (command: unknown) => {
      if (command instanceof GetCommand) {
        assert.equal(command.input.ConsistentRead, true);
        return { Item: records[0] };
      }
      if (command instanceof QueryCommand) {
        assert.equal(command.input.ConsistentRead, true);
        // Every caller observes the missing legacy mapping before any can write.
        if (++readers === callers) {
          assert.ok(release);
          release();
        }
        await ready;
        return { Items: [] };
      }
      assert.ok(command instanceof TransactWriteCommand);
      const operations = command.input.TransactItems;
      assert.equal(operations?.length, 2);
      const primary = operations[0]?.Put;
      const legacy = operations[1]?.Put;
      assert.ok(primary);
      assert.ok(legacy);
      assert.equal(primary.ConditionExpression, "attribute_not_exists(pk)");
      assert.equal(legacy.ConditionExpression, "attribute_not_exists(pk)");
      const item: Record<string, unknown> | undefined = primary.Item;
      assert.ok(item);
      assert.equal(item.pk, cognitoID);
      assert.equal(item.sk, cognitoID);
      assert.deepEqual(legacy.Item, {
        pk: cognitoID,
        sk: item.userID,
        createdAt: item.createdAt,
      });
      candidates.add(item.userID);
      writes++;
      if (records.length) throw conditionalFailure();
      assert.ok(legacy.Item);
      records.push(structuredClone(item), structuredClone(legacy.Item));
      return {};
    },
  );
  const results = await Promise.all(
    Array.from({ length: callers }, () => ensureCognitoUser({ cognitoID })),
  );
  assert.equal(writes, callers);
  assert.equal(candidates.size, callers);
  assert.equal(records.length, 2);
  assert.equal(records.filter((item) => item.sk === cognitoID).length, 1);
  assert.equal(records[1]?.sk, results[0]?.userID);
  assert.deepEqual(
    results,
    results.map(() => ({ userID: records[0]?.userID })),
  );
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), results[0]);
  assert.equal(writes, callers);
});

await test("different Cognito identities get independent fixed keys and user IDs", async () => {
  const records = new Map<unknown, Record<string, unknown>>();
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({ Item: records.get(command.input.Key?.pk) });
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof TransactWriteCommand);
    const item = command.input.TransactItems?.[0]?.Put?.Item;
    assert.ok(item);
    records.set(item.pk, item);
    return Promise.resolve({});
  });
  const otherID = asCognitoUserID("cog_12345678-1234-4234-8234-123456789013");
  const first = await ensureCognitoUser({ cognitoID });
  const second = await ensureCognitoUser({ cognitoID: otherID });
  assert.notEqual(first.userID, second.userID);
  assert.equal(records.size, 2);
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), first);
  assert.deepEqual(await ensureCognitoUser({ cognitoID: otherID }), second);
});

await test("storage read failures propagate without creating a new identity", async () => {
  const error = new Error("Read unavailable");
  const send = mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.reject(error),
  );
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
  assert.equal(send.mock.callCount(), 1);
});

await test("unrelated write errors propagate rather than returning an unused candidate", async () => {
  const error = new Error("Write unavailable");
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) return Promise.resolve({});
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof TransactWriteCommand);
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
});

await test("a conditional conflict with no readable winner propagates the conflict", async () => {
  const error = conditionalFailure();
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) return Promise.resolve({});
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof TransactWriteCommand);
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
});

await test("transaction conflicts, legacy-pointer conflicts and missing cancellation reasons propagate", async () => {
  for (const reasons of [
    [{ Code: "TransactionConflict" }, { Code: "None" }],
    [{ Code: "None" }, { Code: "ConditionalCheckFailed" }],
    [],
  ]) {
    const error = new TransactionCanceledException({
      $metadata: {},
      message: "Transaction failed",
      CancellationReasons: reasons,
    });
    const send = mock.method(
      DynamoDBDocumentClient.prototype,
      "send",
      (command: unknown) => {
        if (command instanceof GetCommand) return Promise.resolve({});
        if (command instanceof QueryCommand)
          return Promise.resolve({ Items: [] });
        assert.ok(command instanceof TransactWriteCommand);
        return Promise.reject(error);
      },
    );
    await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
    assert.equal(send.mock.callCount(), 3);
    send.mock.restore();
  }
});

await test("a lost transaction response can be retried without changing the persisted identity", async () => {
  let persisted: Record<string, unknown> | undefined;
  const error = new Error("Response lost");
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({ Item: persisted });
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof TransactWriteCommand);
    persisted = command.input.TransactItems?.[0]?.Put?.Item;
    writes++;
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
  assert.ok(persisted);
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), {
    userID: persisted.userID,
  });
  assert.equal(writes, 1);
});

await test("malformed fixed-key and legacy mappings fail instead of creating another user", async () => {
  for (const item of [
    { ...canonical, userID: undefined },
    { ...canonical, userID: "invalid" },
    {
      ...canonical,
      sk: asCognitoUserID("cog_12345678-1234-4234-8234-123456789013"),
    },
    { pk: cognitoID, sk: userID, createdAt: "invalid" },
  ]) {
    const send = mock.method(
      DynamoDBDocumentClient.prototype,
      "send",
      (command: unknown) => {
        assert.ok(
          command instanceof GetCommand || command instanceof QueryCommand,
        );
        return Promise.resolve(
          item.sk === userID ?
            command instanceof GetCommand ?
              {}
            : { Items: [item] }
          : { Item: item },
        );
      },
    );
    await assert.rejects(ensureCognitoUser({ cognitoID }), DataIntegrityError);
    send.mock.restore();
  }
});

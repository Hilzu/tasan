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
  new ConditionalCheckFailedException({
    $metadata: {},
    message: "Mapping already exists",
  });
const migrationFailure = () =>
  new TransactionCanceledException({
    $metadata: {},
    message: "Mapping already exists",
    CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
  });

afterEach(() => {
  mock.restoreAll();
});

await test("existing fixed-key mappings use an eventual read without querying or writing", async () => {
  const send = mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    (command: unknown) => {
      assert.ok(command instanceof GetCommand);
      assert.deepEqual(command.input.Key, { pk: cognitoID, sk: cognitoID });
      assert.equal(command.input.ConsistentRead, false);
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

await test("legacy mappings are atomically replaced once, preserving their user and creation time", async () => {
  const legacy = { pk: cognitoID, sk: userID, createdAt };
  let legacyExists = true;
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
      return Promise.resolve({ Items: legacyExists ? [legacy] : [] });
    }
    assert.ok(command instanceof TransactWriteCommand);
    assert.deepEqual(command.input, {
      TransactItems: [
        {
          Put: {
            TableName: "TestTable",
            Item: canonical,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Delete: {
            TableName: "TestTable",
            Key: { pk: cognitoID, sk: userID },
            ConditionExpression: "createdAt = :createdAt",
            ExpressionAttributeValues: { ":createdAt": createdAt },
          },
        },
      ],
    });
    migrated = structuredClone(command.input.TransactItems[0]?.Put?.Item);
    legacyExists = false;
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
  assert.equal(legacyExists, false);
});

await test("a migration between the initial get and legacy query is found by a second strong read", async () => {
  let migrated = false;
  let reads = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      reads++;
      assert.equal(command.input.ConsistentRead, reads > 1);
      return Promise.resolve({ Item: migrated ? canonical : undefined });
    }
    assert.ok(command instanceof QueryCommand);
    // The other request has atomically created the new mapping and deleted the old.
    migrated = true;
    return Promise.resolve({ Items: [] });
  });
  assert.deepEqual(await getCognitoUser(cognitoID), {
    cognitoID,
    userID,
    createdAt: new Date(createdAt),
  });
  assert.equal(reads, 2);
});

await test("concurrent legacy migrations in one replica preserve one mapping and return the same user", async () => {
  const callers = 12;
  const legacy = { pk: cognitoID, sk: userID, createdAt };
  let legacyExists = true;
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
        assert.equal(command.input.ConsistentRead, persisted !== undefined);
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
      assert.ok(command instanceof TransactWriteCommand);
      const operations = command.input.TransactItems;
      assert.equal(operations?.length, 2);
      assert.equal(
        operations[0]?.Put?.ConditionExpression,
        "attribute_not_exists(pk)",
      );
      assert.deepEqual(operations[0]?.Put?.Item, canonical);
      assert.deepEqual(operations[1]?.Delete?.Key, {
        pk: cognitoID,
        sk: userID,
      });
      attempts++;
      if (persisted) throw migrationFailure();
      persisted = structuredClone(operations[0]?.Put?.Item);
      legacyExists = false;
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
  assert.equal(legacyExists, false);
});

await test("a mapping created during legacy lookup wins over the migration candidate", async () => {
  const winner = { ...canonical, userID: genUserID() };
  let reads = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      assert.equal(command.input.ConsistentRead, reads > 0);
      return Promise.resolve(++reads === 1 ? {} : { Item: winner });
    }
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof TransactWriteCommand);
    assert.deepEqual(command.input.TransactItems?.[0]?.Put?.Item, canonical);
    return Promise.reject(migrationFailure());
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), {
    userID: winner.userID,
  });
  assert.equal(reads, 2);
});

await test("migration failures propagate without allocating a different user", async () => {
  for (const error of [
    new Error("Migration write failed"),
    migrationFailure(),
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
        assert.ok(command instanceof TransactWriteCommand);
        return Promise.reject(error);
      },
    );
    await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
    assert.equal(
      send.mock.callCount(),
      error instanceof TransactionCanceledException ? 4 : 3,
    );
    send.mock.restore();
  }
});

await test("migration retries transaction conflicts on either item and preserves the original identity", async () => {
  mock.method(Math, "random", () => 0);
  for (const reasons of [
    [{ Code: "TransactionConflict" }, { Code: "None" }],
    [{ Code: "None" }, { Code: "TransactionConflict" }],
    [{ Code: "TransactionConflict" }, { Code: "TransactionConflict" }],
  ]) {
    let attempts = 0;
    const reads: (boolean | undefined)[] = [];
    const error = new TransactionCanceledException({
      $metadata: {},
      message: "Another migration is in progress",
      CancellationReasons: reasons,
    });
    const send = mock.method(
      DynamoDBDocumentClient.prototype,
      "send",
      (command: unknown) => {
        if (command instanceof GetCommand) {
          reads.push(command.input.ConsistentRead);
          return Promise.resolve({});
        }
        if (command instanceof QueryCommand) {
          assert.equal(command.input.ConsistentRead, true);
          return Promise.resolve({
            Items: [{ pk: cognitoID, sk: userID, createdAt }],
          });
        }
        assert.ok(command instanceof TransactWriteCommand);
        assert.deepEqual(
          command.input.TransactItems?.[0]?.Put?.Item,
          canonical,
        );
        assert.deepEqual(command.input.TransactItems[1]?.Delete?.Key, {
          pk: cognitoID,
          sk: userID,
        });
        return ++attempts === 1 ? Promise.reject(error) : Promise.resolve({});
      },
    );
    assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
    assert.equal(attempts, 2);
    assert.deepEqual(reads, [false, true]);
    send.mock.restore();
  }
});

await test("a committed competing migration is returned after an in-flight conflict", async () => {
  mock.method(Math, "random", () => 0);
  const winner = { ...canonical, userID: genUserID() };
  let committed = false;
  let attempts = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      assert.equal(command.input.ConsistentRead, committed);
      return Promise.resolve({ Item: committed ? winner : undefined });
    }
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof TransactWriteCommand);
    attempts++;
    committed = true;
    return Promise.reject(
      new TransactionCanceledException({
        $metadata: {},
        message: "Competing migration",
        CancellationReasons: [
          { Code: "TransactionConflict" },
          { Code: "None" },
        ],
      }),
    );
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), {
    userID: winner.userID,
  });
  assert.equal(attempts, 1);
});

await test("migration retries are bounded and never fall through to new-user creation", async () => {
  mock.method(Math, "random", () => 0);
  const error = new TransactionCanceledException({
    $metadata: {},
    message: "Persistent conflict",
    CancellationReasons: [{ Code: "TransactionConflict" }, { Code: "None" }],
  });
  let attempts = 0;
  const reads: (boolean | undefined)[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      reads.push(command.input.ConsistentRead);
      return Promise.resolve({});
    }
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof TransactWriteCommand);
    attempts++;
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
  assert.equal(attempts, 6);
  assert.deepEqual(reads, [false, ...Array<boolean>(6).fill(true)]);
});

await test("a migration winner committed at the retry limit is still returned", async () => {
  mock.method(Math, "random", () => 0);
  let attempts = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      if (attempts > 0) assert.equal(command.input.ConsistentRead, true);
      return Promise.resolve({ Item: attempts === 6 ? canonical : undefined });
    }
    if (command instanceof QueryCommand)
      return Promise.resolve({
        Items: [{ pk: cognitoID, sk: userID, createdAt }],
      });
    assert.ok(command instanceof TransactWriteCommand);
    attempts++;
    return Promise.reject(
      new TransactionCanceledException({
        $metadata: {},
        message: "Migration in progress",
        CancellationReasons: [
          { Code: "TransactionConflict" },
          { Code: "None" },
        ],
      }),
    );
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.equal(attempts, 6);
});

await test("a stale initial lookup is recovered before an existing identity can be recreated", async () => {
  const reads: (boolean | undefined)[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      reads.push(command.input.ConsistentRead);
      return Promise.resolve({
        Item: command.input.ConsistentRead ? canonical : undefined,
      });
    }
    assert.ok(command instanceof QueryCommand);
    assert.equal(command.input.ConsistentRead, true);
    return Promise.resolve({ Items: [] });
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.deepEqual(reads, [false, true]);
});

await test("creation conflicts strongly read the winning mapping directly", async () => {
  const winner = { ...canonical, userID: genUserID() };
  let committed = false;
  const reads: (boolean | undefined)[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) {
      reads.push(command.input.ConsistentRead);
      return Promise.resolve({
        Item: committed && command.input.ConsistentRead ? winner : undefined,
      });
    }
    if (command instanceof QueryCommand) {
      assert.equal(committed, false);
      return Promise.resolve({ Items: [] });
    }
    assert.ok(command instanceof PutCommand);
    committed = true;
    return Promise.reject(conditionalFailure());
  });
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), {
    userID: winner.userID,
  });
  assert.deepEqual(reads, [false, true, true]);
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
    assert.ok(command instanceof TransactWriteCommand);
    persisted = structuredClone(command.input.TransactItems?.[0]?.Put?.Item);
    writes++;
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
  assert.deepEqual(await ensureCognitoUser({ cognitoID }), { userID });
  assert.deepEqual(persisted, canonical);
  assert.equal(writes, 1);
});

await test("concurrent first logins in one replica all return the single persisted mapping", async () => {
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
      assert.ok(command instanceof PutCommand);
      assert.equal(
        command.input.ConditionExpression,
        "attribute_not_exists(pk)",
      );
      const item: Record<string, unknown> | undefined = command.input.Item;
      assert.ok(item);
      assert.equal(item.pk, cognitoID);
      assert.equal(item.sk, cognitoID);
      candidates.add(item.userID);
      writes++;
      if (records.length) throw conditionalFailure();
      records.push(structuredClone(item));
      return {};
    },
  );
  const results = await Promise.all(
    Array.from({ length: callers }, () => ensureCognitoUser({ cognitoID })),
  );
  assert.equal(writes, callers);
  assert.equal(candidates.size, callers);
  assert.equal(records.length, 1);
  assert.equal(records.filter((item) => item.sk === cognitoID).length, 1);
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
    assert.ok(command instanceof PutCommand);
    const item = command.input.Item;
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
    assert.ok(command instanceof PutCommand);
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
});

await test("a conditional conflict with no readable winner propagates the conflict", async () => {
  const error = conditionalFailure();
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand) return Promise.resolve({});
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof PutCommand);
    return Promise.reject(error);
  });
  await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
});

await test("non-retryable migration failures propagate without retrying", async () => {
  for (const reasons of [
    [{ Code: "TransactionConflict" }, { Code: "ValidationError" }],
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
          return Promise.resolve({
            Items: [{ pk: cognitoID, sk: userID, createdAt }],
          });
        assert.ok(command instanceof TransactWriteCommand);
        return Promise.reject(error);
      },
    );
    await assert.rejects(ensureCognitoUser({ cognitoID }), (e) => e === error);
    assert.equal(send.mock.callCount(), 3);
    send.mock.restore();
  }
});

await test("a lost creation response can be retried without changing the persisted identity", async () => {
  let persisted: Record<string, unknown> | undefined;
  const error = new Error("Response lost");
  let writes = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof GetCommand)
      return Promise.resolve({ Item: persisted });
    if (command instanceof QueryCommand) return Promise.resolve({ Items: [] });
    assert.ok(command instanceof PutCommand);
    persisted = command.input.Item;
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

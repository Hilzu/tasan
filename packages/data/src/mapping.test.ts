import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  asCognitoUserID,
  genExpenseID,
  genInviteID,
  genOperationID,
  genSessionID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";

import { DataIntegrityError } from "./errors.js";
import {
  cognitoUserItemSchema,
  expenseIDOf,
  expenseOperationKey,
  inviteSplitItemSchema,
  operationIDOf,
  parseItem,
  sessionItemSchema,
  splitExpenseItemSchema,
  splitItemSchema,
  splitUserItemSchema,
  userItemSchema,
} from "./items.js";

process.env.TABLE_NAME = "TestTable";
const api = await import("./main.js");
const userID = genUserID();
const splitID = genSplitID();
const now = new Date().toISOString();

afterEach(() => {
  mock.restoreAll();
});

await test("public operations round-trip domain objects without exposing storage attributes", async () => {
  const records: Record<string, unknown>[] = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof UpdateCommand) {
      const { Key, ExpressionAttributeValues: values } = command.input;
      assert.ok(Key);
      assert.ok(values);
      records.push({
        ...Key,
        name: values[":name"],
        email: values[":email"],
        createdAt: values[":now"],
      });
      return Promise.resolve({});
    }
    if (command instanceof PutCommand) {
      assert.ok(command.input.Item);
      records.push(structuredClone(command.input.Item));
      return Promise.resolve({});
    }
    if (command instanceof TransactWriteCommand) {
      for (const operation of command.input.TransactItems ?? []) {
        assert.ok(operation.Put?.Item);
        records.push(structuredClone(operation.Put.Item));
      }
      return Promise.resolve({});
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key;
      assert.ok(key);
      return Promise.resolve({
        Item: records.find((item) => item.pk === key.pk && item.sk === key.sk),
      });
    }
    assert.ok(command instanceof QueryCommand);
    const values = command.input.ExpressionAttributeValues;
    return Promise.resolve({
      Items: records.filter(
        (item) => item.pk === (values?.[":pk"] ?? values?.[":sk"]),
      ),
    });
  });

  const user = { id: userID, name: "Alice", email: "alice@example.com" };
  await api.putUser(user);
  assert.deepEqual(await api.getUser(userID), user);

  const { id } = await api.createSplit({
    name: "Trip",
    currency: "JPY",
    createdBy: userID,
  });
  const split = await api.getSplit(id);
  assert.ok(split);
  assert.equal(split.name, "Trip");
  assert.ok(split.createdAt instanceof Date);
  assert.equal("pk" in split, false);
  assert.deepEqual(await api.getSplitUser(userID, id), {
    userID,
    splitID: id,
    createdBy: userID,
  });

  const membership = { userID, splitID, createdBy: userID };
  await api.createSplitUser(membership);
  assert.deepEqual(await api.getSplitUser(userID, splitID), membership);

  const expiresAt = new Date("2026-10-22T12:00:00.000Z");
  const session = {
    id: genSessionID(),
    userID,
    expiresAt,
    authState: "state",
    accessToken: "secret",
    refreshToken: "refresh",
  };
  await api.putSession(session);
  const restored = await api.getSession(session.id);
  assert.ok(restored);
  assert.equal(restored.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(restored.userID, userID);
  assert.equal(restored.accessToken, session.accessToken);
  assert.equal(restored.authNonce, undefined);
  assert.equal("forUser" in restored, false);
  assert.equal("createdAt" in restored, false);

  const invite = await api.createInviteForSplit({ splitID, createdBy: userID });
  const restoredInvite = await api.findInviteForSplit(invite.id);
  assert.ok(restoredInvite);
  assert.equal(restoredInvite.splitID, splitID);
  assert.ok(restoredInvite.expiresAt instanceof Date);
  assert.equal("sk" in restoredInvite, false);

  const cognitoID = asCognitoUserID("cog_12345678-1234-4234-8234-123456789012");
  const account = await api.ensureCognitoUser({ cognitoID });
  const restoredAccount = await api.getCognitoUser(cognitoID);
  assert.ok(restoredAccount);
  assert.equal(restoredAccount.userID, account.userID);
  assert.ok(restoredAccount.createdAt instanceof Date);
  assert.equal("pk" in restoredAccount, false);
});

await test("missing records remain undefined; malformed records fail with a domain error", async () => {
  const send = mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.resolve({}),
  );
  assert.equal(await api.getUser(userID), undefined);
  send.mock.mockImplementation(() =>
    Promise.resolve({ Item: { pk: userID, sk: userID, name: 123 } }),
  );
  await assert.rejects(() => api.getUser(userID), DataIntegrityError);
});

await test("each model rejects malformed required fields and keys", () => {
  const user = {
    pk: userID,
    sk: userID,
    name: "Alice",
    email: "alice@example.com",
    createdAt: now,
  };
  assert.equal(parseItem(userItemSchema, user, "user").pk, userID);
  assert.throws(
    () => parseItem(userItemSchema, { ...user, sk: genUserID() }, "user"),
    DataIntegrityError,
  );
  assert.throws(
    () =>
      parseItem(userItemSchema, { ...user, createdAt: "not-a-date" }, "user"),
    DataIntegrityError,
  );
  assert.throws(
    () =>
      parseItem(
        splitItemSchema,
        {
          pk: splitID,
          sk: splitID,
          createdAt: now,
          createdBy: userID,
          name: "Trip",
          currency: "INVALID",
        },
        "split",
      ),
    DataIntegrityError,
  );
  assert.throws(
    () =>
      parseItem(
        splitUserItemSchema,
        { pk: userID, sk: splitID, createdAt: now, createdBy: userID },
        "split-user",
      ),
    DataIntegrityError,
  );
  assert.throws(
    () =>
      parseItem(
        inviteSplitItemSchema,
        {
          pk: genInviteID(),
          sk: splitID,
          createdAt: now,
          createdBy: userID,
          expiresAt: "tomorrow",
        },
        "invite-split",
      ),
    DataIntegrityError,
  );
  assert.throws(
    () =>
      parseItem(
        cognitoUserItemSchema,
        { pk: "invalid", sk: userID, createdAt: now },
        "cognito-user",
      ),
    DataIntegrityError,
  );
  const sessionID = genSessionID();
  assert.throws(
    () =>
      parseItem(
        sessionItemSchema,
        {
          pk: sessionID,
          sk: sessionID,
          createdAt: now,
          expiresAt: Number.MAX_SAFE_INTEGER,
        },
        "session",
      ),
    DataIntegrityError,
  );
});

await test("malformed session data never includes credentials or Zod input in its error", async () => {
  const secret = "do-not-expose-this-token";
  mock.method(DynamoDBDocumentClient.prototype, "send", () =>
    Promise.resolve({
      Item: { pk: genSessionID(), accessToken: secret, refreshToken: secret },
    }),
  );
  await assert.rejects(
    () => api.getSession(genSessionID()),
    (error) => {
      assert.ok(error instanceof DataIntegrityError);
      assert.equal(error.message, "Invalid stored session record");
      assert.equal("cause" in error, false);
      assert.equal("issues" in error, false);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    },
  );
});

await test("expense keys and revision metadata are checked together; legacy tombstones remain valid", () => {
  const expenseID = genExpenseID();
  const operationID = genOperationID();
  const baseline = {
    pk: splitID,
    sk: expenseID,
    name: "Dinner",
    amount: 1000,
    currency: "JPY",
    createdAt: now,
    createdBy: userID,
    payer: userID,
    participants: { [userID]: 1000 },
  };
  const item = parseItem(splitExpenseItemSchema, baseline, "split-expense");
  assert.equal(expenseIDOf(item), expenseID);
  assert.equal(operationIDOf(item), undefined);
  assert.ok(
    splitExpenseItemSchema.safeParse({ ...baseline, deletedAt: now }).success,
  );
  const revision = {
    ...baseline,
    sk: expenseOperationKey(expenseID, operationID),
    updatedAt: now,
    updatedBy: userID,
  };
  assert.equal(
    operationIDOf(parseItem(splitExpenseItemSchema, revision, "split-expense")),
    operationID,
  );
  for (const invalid of [
    { ...revision, updatedBy: undefined },
    { ...revision, updatedAt: undefined },
    { ...revision, sk: `${expenseID}#bad` },
    { ...revision, sk: `${revision.sk}#extra` },
    { ...baseline, participants: { bad: 1000 } },
    { ...baseline, amount: Infinity },
    { ...baseline, amount: NaN },
    { ...baseline, conversionRate: 0 },
    { ...baseline, createdBy: splitID },
  ])
    assert.throws(
      () => parseItem(splitExpenseItemSchema, invalid, "split-expense"),
      DataIntegrityError,
    );
});

await test("public entry point excludes persistence schemas, item types, clients and raw mappers", () => {
  for (const name of Object.keys(api)) {
    assert.doesNotMatch(name, /Item|Schema|Client|Table|fromItem|toItem/);
  }
  assert.equal("findExpenseOperation" in api, false);
});

await test("optional session attributes are omitted by the real SDK serializer", async () => {
  process.env.AWS_REGION = "eu-west-1";
  process.env.AWS_ACCESS_KEY_ID = "test-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  const { dynamoClient } = await import("./client.js");
  let requests = 0;
  mock.method(
    dynamoClient().config.requestHandler,
    "handle",
    (request: unknown) => {
      assert.ok(request && typeof request === "object" && "body" in request);
      assert.ok(typeof request.body === "string");
      const payload: unknown = JSON.parse(request.body);
      assert.ok(payload && typeof payload === "object" && "Item" in payload);
      assert.ok(payload.Item && typeof payload.Item === "object");
      for (const field of [
        "forUser",
        "authState",
        "authNonce",
        "authRedirect",
        "accessToken",
        "refreshToken",
      ]) {
        assert.equal(field in payload.Item, false);
      }
      requests++;
      return Promise.resolve({
        response: {
          statusCode: 200,
          headers: {},
          body: new TextEncoder().encode("{}"),
        },
      });
    },
  );
  await api.putSession({
    id: genSessionID(),
    expiresAt: new Date("2026-10-22T00:00:00.000Z"),
  });
  assert.equal(requests, 1);
});

await test("split listing validates key-only index projections without requiring unprojected metadata", async () => {
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof QueryCommand) {
      assert.equal(command.input.IndexName, "GSI-SK-PK");
      return Promise.resolve({ Items: [{ pk: splitID, sk: userID }] });
    }
    assert.ok(command instanceof BatchGetCommand);
    return Promise.resolve({
      Responses: {
        TestTable: [
          {
            pk: splitID,
            sk: splitID,
            name: "Trip",
            currency: "EUR",
            createdAt: now,
            createdBy: userID,
          },
        ],
      },
    });
  });
  assert.deepEqual(await api.findUserSplitIDs(userID), [splitID]);
  assert.deepEqual(await api.findUsersSplits(userID), [
    {
      id: splitID,
      name: "Trip",
      currency: "EUR",
      createdAt: new Date(now),
      createdBy: userID,
    },
  ]);
});

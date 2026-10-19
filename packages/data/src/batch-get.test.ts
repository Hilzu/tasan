import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { genSplitID, genUserID } from "@tasan/common/id";

import { DataIntegrityError } from "./errors.js";

process.env.TABLE_NAME = "TestTable";
const { getUsers } = await import("./models/user.js");
const { findUsersSplits } = await import("./models/split.js");
const ownerID = genUserID();
const createdAt = "2026-10-19T00:00:00.000Z";

interface Fixture {
  items: Record<string, unknown>[];
  expected: { id: string }[];
  read: () => Promise<{ id: string }[]>;
}

const scenarios = [
  {
    name: "getUsers",
    fixture: (count: number): Fixture => {
      const ids = Array.from({ length: count }, () => genUserID());
      return {
        items: ids.map((id) => ({
          pk: id,
          sk: id,
          name: id,
          email: `${id}@example.com`,
          createdAt,
        })),
        expected: ids.map((id) => ({
          id,
          name: id,
          email: `${id}@example.com`,
        })),
        read: () => getUsers(new Set(ids)),
      };
    },
  },
  {
    name: "findUsersSplits",
    fixture: (count: number): Fixture => {
      const ids = Array.from({ length: count }, () => genSplitID());
      return {
        items: ids.map((id) => ({
          pk: id,
          sk: id,
          name: id,
          createdBy: ownerID,
          createdAt,
          currency: "JPY",
        })),
        expected: ids
          .sort()
          .reverse()
          .map((id) => ({
            id,
            name: id,
            createdBy: ownerID,
            createdAt: new Date(createdAt),
            currency: "JPY",
          })),
        read: () => findUsersSplits(ownerID),
      };
    },
  },
];

const keysOf = (items: Record<string, unknown>[]) =>
  items.map(({ pk, sk }) => ({ pk, sk }));

const intercept = (
  fixture: Fixture,
  respond: (command: BatchGetCommand) => Partial<BatchGetCommandOutput>,
) =>
  mock.method(DynamoDBDocumentClient.prototype, "send", (command: unknown) => {
    if (command instanceof QueryCommand) {
      assert.equal(command.input.IndexName, "GSI-SK-PK");
      return Promise.resolve({
        Items: fixture.items.map(({ pk }) => ({ pk, sk: ownerID })),
      });
    }
    assert.ok(command instanceof BatchGetCommand);
    // Preserve the existing eventually consistent read behavior.
    assert.equal(
      command.input.RequestItems?.TestTable.ConsistentRead,
      undefined,
    );
    return Promise.resolve(respond(command));
  });

const assertResults = (
  name: string,
  actual: { id: string }[],
  fixture: Fixture,
) => {
  if (name === "findUsersSplits") assert.deepEqual(actual, fixture.expected);
  else {
    const byID = (a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id);
    assert.deepEqual(actual.toSorted(byID), fixture.expected.toSorted(byID));
  }
};

afterEach(() => {
  mock.restoreAll();
});

for (const { name, fixture: createFixture } of scenarios) {
  await test(`${name} splits 205 keys into batches of at most 100`, async () => {
    const fixture = createFixture(205);
    const sizes: number[] = [];
    intercept(fixture, (command) => {
      const keys = command.input.RequestItems?.TestTable.Keys;
      assert.ok(keys);
      sizes.push(keys.length);
      assert.deepEqual(
        keys,
        keysOf(
          fixture.items.slice((sizes.length - 1) * 100, sizes.length * 100),
        ),
      );
      return {
        Responses: {
          TestTable: fixture.items
            .filter((item) => keys.some((key) => key.pk === item.pk))
            .reverse(),
        },
      };
    });
    assertResults(name, await fixture.read(), fixture);
    assert.deepEqual(sizes, [100, 100, 5]);
  });

  await test(`${name} retries only unprocessed keys across repeated partial responses`, async () => {
    const fixture = createFixture(5);
    const pending = fixture.items.slice(1);
    let calls = 0;
    mock.method(Math, "random", () => 0);
    intercept(fixture, (command) => {
      const expected =
        calls === 0 ? fixture.items
        : calls === 1 ? pending
        : pending.slice(1);
      assert.deepEqual(
        command.input.RequestItems?.TestTable.Keys,
        keysOf(expected),
      );
      calls++;
      return calls < 3 ?
          {
            Responses: { TestTable: expected.slice(0, 1) },
            UnprocessedKeys: { TestTable: { Keys: keysOf(expected.slice(1)) } },
          }
        : { Responses: { TestTable: expected.toReversed() } };
    });
    assertResults(name, await fixture.read(), fixture);
    assert.equal(calls, 3);
  });

  await test(`${name} handles an empty response with every key unprocessed`, async () => {
    const fixture = createFixture(2);
    let calls = 0;
    mock.method(Math, "random", () => 0);
    intercept(fixture, () =>
      ++calls === 1 ?
        {
          UnprocessedKeys: { TestTable: { Keys: keysOf(fixture.items) } },
        }
      : { Responses: { TestTable: fixture.items } },
    );
    assertResults(name, await fixture.read(), fixture);
    assert.equal(calls, 2);
  });

  await test(`${name} fails after bounded retries instead of returning incomplete data`, async () => {
    const fixture = createFixture(3);
    let calls = 0;
    mock.method(Math, "random", () => 0);
    intercept(fixture, (command) => {
      if (calls > 0)
        assert.deepEqual(
          command.input.RequestItems?.TestTable.Keys,
          keysOf(fixture.items.slice(1)),
        );
      calls++;
      return {
        Responses: { TestTable: calls === 1 ? fixture.items.slice(0, 1) : [] },
        UnprocessedKeys: {
          TestTable: { Keys: keysOf(fixture.items.slice(1)) },
        },
      };
    });
    await assert.rejects(
      fixture.read(),
      /exhausted retries for unprocessed keys/,
    );
    assert.equal(calls, 6);
  });

  await test(`${name} propagates a failure after a partial response`, async () => {
    const fixture = createFixture(2);
    const error = new Error("Batch read unavailable");
    let calls = 0;
    mock.method(Math, "random", () => 0);
    intercept(fixture, () => {
      if (++calls > 1) throw error;
      return {
        Responses: { TestTable: fixture.items.slice(0, 1) },
        UnprocessedKeys: {
          TestTable: { Keys: keysOf(fixture.items.slice(1)) },
        },
      };
    });
    await assert.rejects(fixture.read(), (e) => e === error);
    assert.equal(calls, 2);
  });

  await test(`${name} does not retry records that are missing rather than unprocessed`, async () => {
    const fixture = createFixture(2);
    let calls = 0;
    intercept(fixture, () => {
      calls++;
      return {};
    });
    assert.deepEqual(await fixture.read(), []);
    assert.equal(calls, 1);
  });

  await test(`${name} skips batch reads for empty input`, async () => {
    intercept(createFixture(0), () => {
      assert.fail("Empty input must not issue a batch read");
    });
    assert.deepEqual(await createFixture(0).read(), []);
  });

  await test(`${name} validates items returned by a retry`, async () => {
    const fixture = createFixture(1);
    let calls = 0;
    mock.method(Math, "random", () => 0);
    intercept(fixture, () =>
      ++calls === 1 ?
        {
          UnprocessedKeys: { TestTable: { Keys: keysOf(fixture.items) } },
        }
      : {
          Responses: {
            TestTable: [{ ...fixture.items[0], createdAt: "invalid" }],
          },
        },
    );
    await assert.rejects(fixture.read(), DataIntegrityError);
    assert.equal(calls, 2);
  });
}

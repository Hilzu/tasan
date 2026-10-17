import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { genSplitID } from "@tasan/common/id";

process.env.TABLE_NAME = "TestTable";
const { exportSplitBackup } = await import("./backup.js");
afterEach(() => {
  mock.restoreAll();
});

await test("opaque backups preserve raw records, revisions and tombstones across all pages", async () => {
  const splitID = genSplitID();
  const records = [
    { pk: { S: splitID }, sk: { S: "original" }, amount: { N: "12.34" } },
    {
      pk: { S: splitID },
      sk: { S: "revision" },
      deletedAt: { S: "2026-10-17T00:00:00.000Z" },
    },
  ];
  let page = 0;
  mock.method(DynamoDBClient.prototype, "send", (command: unknown) => {
    assert.ok(command instanceof QueryCommand);
    assert.equal(command.input.TableName, "TestTable");
    assert.deepEqual(command.input.ExpressionAttributeValues, {
      ":pk": { S: splitID },
    });
    assert.equal(command.input.FilterExpression, undefined);
    assert.deepEqual(
      command.input.ExclusiveStartKey,
      page === 0 ? undefined : { pk: { S: splitID }, sk: { S: "original" } },
    );
    return Promise.resolve({
      Items: [records[page++]],
      LastEvaluatedKey:
        page === 1 ? { pk: { S: splitID }, sk: { S: "original" } } : undefined,
    });
  });
  assert.equal(await exportSplitBackup(splitID), JSON.stringify(records));
  assert.equal(page, 2);
});

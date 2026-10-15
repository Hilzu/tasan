import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { DynamoDBClient, paginateQuery } from "@aws-sdk/client-dynamodb";
import { asSplitID } from "@tasan/common/id";

const TableName = "TasanAppTable";

const { values } = parseArgs({
  options: {
    "split-id": { type: "string" },
  },
});

const splitID = asSplitID(values["split-id"] ?? "");
const client = new DynamoDBClient();
const paginator = paginateQuery(
  { client },
  {
    TableName,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": { S: splitID } },
  },
);

const items = [];
for await (const page of paginator) {
  if (!page.Items?.length) continue;
  items.push(...page.Items);
}

const date = new Date()
  .toISOString()
  .replaceAll(":", "")
  .replaceAll("-", "")
  .replace("T", "_")
  .replace(/\.\d\d\dZ$/, "");
const filename = `out/${splitID}-${date}.json`;
await writeFile(filename, JSON.stringify(items));

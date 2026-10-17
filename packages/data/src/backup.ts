import { paginateQuery } from "@aws-sdk/client-dynamodb";
import type { SplitID } from "@tasan/common/id";

import { dynamoClient } from "./client.js";
import { TableName } from "./config.js";

/** An opaque backup, including all revisions and deletions. Callers must not interpret its format. */
export const exportSplitBackup = async (splitID: SplitID): Promise<string> => {
  const items = [];
  for await (const page of paginateQuery(
    { client: dynamoClient() },
    {
      TableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": { S: splitID } },
    },
  ))
    items.push(...(page.Items ?? []));
  return JSON.stringify(items);
};

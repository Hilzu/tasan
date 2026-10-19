import { setTimeout } from "node:timers/promises";

import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "./client.js";
import { TableName } from "./config.js";

const batchSize = 100;
const maxRetries = 5;

/** Read every requested key, or fail rather than return a throttled partial result. */
export const batchGetItems = async (
  keys: readonly { pk: string; sk: string }[],
): Promise<Record<string, unknown>[]> => {
  const items: Record<string, unknown>[] = [];
  for (let offset = 0; offset < keys.length; offset += batchSize) {
    let pending: Record<string, unknown>[] = keys.slice(
      offset,
      offset + batchSize,
    );
    for (let attempt = 0; ; attempt++) {
      const { Responses, UnprocessedKeys } = await documentClient().send(
        new BatchGetCommand({
          RequestItems: { [TableName]: { Keys: pending } },
        }),
      );
      items.push(...(Responses?.[TableName] ?? []));
      pending = UnprocessedKeys?.[TableName]?.Keys ?? [];
      if (!pending.length) break;
      if (attempt === maxRetries)
        throw new Error(
          "DynamoDB batch read exhausted retries for unprocessed keys",
        );
      // Full jitter prevents concurrent readers from retrying in lockstep.
      await setTimeout(Math.floor(Math.random() * 50 * 2 ** attempt));
    }
  }
  return items;
};

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  asExpenseID,
  asInviteID,
  asSessionID,
  asSplitID,
  asUserID,
  genExpenseID,
  genInviteID,
  genSessionID,
  genSplitID,
  genUserID,
} from "@tasan/common/id";

const kinds = [
  ["exp", genExpenseID, asExpenseID],
  ["inv", genInviteID, asInviteID],
  ["ses", genSessionID, asSessionID],
  ["spl", genSplitID, asSplitID],
  ["usr", genUserID, asUserID],
] as const;

await test("generated IDs and the full ULID timestamp range are accepted", () => {
  for (const [prefix, generate, parse] of kinds) {
    const id = generate();
    assert.equal(parse(id), id);
    // Preserve offline retries and skewed client clocks, including future IDs.
    for (const suffix of ["0".repeat(26), `7${"z".repeat(25)}`]) {
      const extreme = `${prefix}_${suffix}`;
      assert.equal(parse(extreme), extreme);
    }
  }
});

await test("IDs require an exact prefix, length, and canonical alphabet", () => {
  for (const [prefix, generate, parse] of kinds) {
    const id = generate();
    const suffix = id.slice(4);
    for (const invalid of [
      "",
      suffix,
      `wrong_${suffix}`,
      id.toUpperCase(),
      ` ${id}`,
      `${id} `,
      `${id}\n`,
      `${id}\r\n`,
      `${id}\0`,
      `${id}_extra`,
      `${id}x`,
      id.slice(0, -1),
      `${prefix}_8${suffix.slice(1)}`,
      ...["i", "l", "o", "u", "é", "/", ".", "\n"].map(
        (c) => `${id.slice(0, -1)}${c}`,
      ),
      `${prefix}_${"0".repeat(100_000)}`,
    ])
      assert.throws(() => parse(invalid), { message: `Invalid ${prefix} id` });
  }
});

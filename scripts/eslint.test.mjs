import assert from "node:assert/strict";
import { test } from "node:test";

import { ESLint } from "eslint";

const eslint = new ESLint();

async function restrictedImports(source) {
  const [result] = await eslint.lintText(source, {
    filePath: "packages/common/src/currency-convert.ts",
  });
  assert.equal(result.fatalErrorCount, 0, source);
  return result.messages.filter(
    ({ ruleId }) => ruleId === "no-restricted-syntax",
  );
}

await test("rejects runtime imports and re-exports of the Zod namespace", async () => {
  for (const source of [
    'import { z } from "zod";',
    'import { z as schema } from "zod/v4";',
    'import { "z" as schema } from "zod";',
    'import { flattenError, z } from "zod";',
    'import z from "zod";',
    'import { default as schema } from "zod/mini";',
    'export { z as schema } from "zod";',
    'export { default as schema } from "zod/v4";',
  ]) {
    assert.equal((await restrictedImports(source)).length, 1, source);
  }
});

await test("allows namespace imports, individual helpers and type-only imports", async () => {
  for (const source of [
    'import * as z from "zod";',
    'import * as z from "zod/v4";',
    'import { flattenError, type z } from "zod";',
    'import type { z } from "zod";',
    'export { type z } from "zod";',
    'export type { z } from "zod";',
    'import { z } from "zod-form-data";',
  ]) {
    assert.equal((await restrictedImports(source)).length, 0, source);
  }
});

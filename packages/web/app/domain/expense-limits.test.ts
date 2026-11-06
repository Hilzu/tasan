import assert from "node:assert/strict";
import { test } from "node:test";

import * as M from "@tasan/common/money";

import { amountLimitError } from "./expense-limits";

await test("amounts allow up to one trillion units in either direction", () => {
  for (const currency of ["EUR", "JPY"] as const) {
    const maximum = M.create("1000000000000", currency);
    const over = M.add(maximum, M.fromMinorUnits(1n, currency));
    assert.equal(amountLimitError(maximum), undefined);
    assert.equal(amountLimitError(M.negate(maximum)), undefined);
    for (const amount of [over, M.negate(over)])
      assert.equal(
        amountLimitError(amount),
        `Amount must not exceed 1 trillion ${currency}.`,
      );
    assert.equal(
      amountLimitError(over, { converted: true }),
      `Converted amount must not exceed 1 trillion ${currency}.`,
    );
  }
});

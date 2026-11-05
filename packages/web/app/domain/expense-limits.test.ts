import assert from "node:assert/strict";
import { test } from "node:test";

import * as M from "@tasan/common/money";

import { expenseAmountLimitError } from "./expense-limits";

await test("expenses allow up to one trillion units in any supported currency precision", () => {
  for (const currency of ["EUR", "JPY"] as const) {
    const maximum = M.create("1000000000000", currency);
    assert.equal(expenseAmountLimitError(maximum), undefined);
    const error = expenseAmountLimitError(
      M.add(maximum, M.fromMinorUnits(1n, currency)),
    );
    assert.equal(
      error,
      `Expense amount must not exceed 1 trillion ${currency}.`,
    );
    assert.ok(expenseAmountLimitError(M.create("1e36", currency)));
  }
});

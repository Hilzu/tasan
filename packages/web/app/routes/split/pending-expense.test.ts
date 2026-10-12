import assert from "node:assert/strict";
import { test } from "node:test";

import { genExpenseID, genUserID } from "@tasan/common/id";

import { decodePendingExpense, encodePendingExpense } from "./pending-expense";

await test("recovery keeps the exact ID and submitted values across a reload", () => {
  const form = new FormData();
  const id = genExpenseID();
  const payer = genUserID();
  form.set("expenseID", id);
  form.set("expenseName", "Dinner");
  form.set("currency", "JPY");
  form.set("amount", "1000");
  form.set("payer", payer);
  form.set(`participants.${payer}`, "1000");
  const recovered = decodePendingExpense(encodePendingExpense(form));
  assert.deepEqual([...recovered.entries()], [...form.entries()]);
  assert.equal(recovered.get("expenseID"), id);
});

await test("corrupt saved submissions are rejected rather than assigned a new ID", () => {
  for (const saved of [
    "invalid JSON",
    "{}",
    "[]",
    JSON.stringify([["expenseID", "invalid"]]),
  ])
    assert.throws(() => decodePendingExpense(saved));
});

await test("recovery preserves invalid input so the server can return validation errors", () => {
  const form = new FormData();
  form.set("expenseID", genExpenseID());
  form.set("amount", "invalid amount");
  assert.deepEqual(
    [...decodePendingExpense(encodePendingExpense(form)).entries()],
    [...form.entries()],
  );
});

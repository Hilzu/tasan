import assert from "node:assert/strict";
import { test } from "node:test";

import { genExpenseID, genOperationID, genUserID } from "@tasan/common/id";
import { flattenError } from "zod";

import {
  deleteExpenseFormSchema,
  editExpenseFormSchema,
  newExpenseFormSchema,
} from "./new-expense-form";

const payer = genUserID();
const form = () => {
  const data = new FormData();
  data.set("expenseID", genExpenseID());
  data.set("expenseName", "Dinner");
  data.set("currency", "JPY");
  data.set("amount", "10.005");
  data.set("payer", payer);
  return data;
};

await test("expense form preserves precision and ignores client home currency", () => {
  const data = form();
  data.set(`participants.${payer}`, "10.005");
  data.set("splitCurrency", "USD");
  const parsed = newExpenseFormSchema.parse(data);
  assert.equal(parsed.expenseName, "Dinner");
  assert.equal(parsed.amount, 10.005);
  assert.equal(parsed.participants[payer], 10.005);
  assert.equal("splitCurrency" in parsed, false);
});

await test("expense name decoding reports errors under the explicit form field", () => {
  const data = form();
  data.delete("expenseName");
  data.set("name", "Unrelated autocomplete value");
  const parsed = newExpenseFormSchema.safeParse(data);
  assert.equal(parsed.success, false);
  assert.ok(flattenError(parsed.error).fieldErrors.expenseName?.length);
});

await test("expense form permits empty participants for application validation", () => {
  assert.deepEqual(newExpenseFormSchema.parse(form()).participants, {});
});

await test("malformed participant IDs produce validation errors", () => {
  const data = form();
  data.set("participants.invalid-user", "10");
  const parsed = newExpenseFormSchema.safeParse(data);
  assert.equal(parsed.success, false);
});

await test("expense forms require a well-formed client expense ID", () => {
  for (const id of ["", "invalid", `${genExpenseID()}_extra`, genUserID()]) {
    const data = form();
    data.set("expenseID", id);
    assert.equal(newExpenseFormSchema.safeParse(data).success, false);
  }
});

await test("expense transport discards client ownership and timestamp fields", () => {
  const data = form();
  data.set("createdBy", genUserID());
  data.set("createdAt", "2099-01-01T00:00:00.000Z");
  const parsed = newExpenseFormSchema.parse(data);
  assert.equal("createdBy" in parsed, false);
  assert.equal("createdAt" in parsed, false);
});

await test("edit and delete forms require a valid operation ID without a base version", () => {
  const data = form();
  const operationID = genOperationID();
  data.set("operationID", operationID);
  const parsed = editExpenseFormSchema.parse(data);
  assert.equal(parsed.operationID, operationID);
  assert.equal("expenseID" in parsed, false);
  assert.deepEqual(deleteExpenseFormSchema.parse(data), {
    operationID,
  });
  data.set("operationID", genExpenseID());
  assert.equal(editExpenseFormSchema.safeParse(data).success, false);
  assert.equal(deleteExpenseFormSchema.safeParse(data).success, false);
});

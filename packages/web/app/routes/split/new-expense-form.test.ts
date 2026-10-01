import assert from "node:assert/strict";
import { test } from "node:test";

import { genUserID } from "@tasan/common/id";
import { flattenError } from "zod";

import { newExpenseFormSchema } from "./new-expense-form";

const payer = genUserID();
const form = () => {
  const data = new FormData();
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

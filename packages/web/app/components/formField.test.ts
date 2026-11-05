import assert from "node:assert/strict";
import { test } from "node:test";

import * as M from "@tasan/common/money";

import {
  normalizeAmountInput,
  parseNumber,
  readAmountInput,
  resolveAmount,
} from "~/components/formField";

await test("currency normalization keeps displayed and resolved amounts consistent", () => {
  for (const input of [
    { text: "100.50", expressionMode: false },
    { text: "100 + 0.50", expressionMode: true },
  ]) {
    const yen = normalizeAmountInput(input, "JPY");
    assert.equal(yen.text, "101");
    assert.deepEqual(
      resolveAmount(yen.text, yen.expressionMode, "JPY"),
      M.create("101", "JPY"),
    );
    const euros = normalizeAmountInput(yen, "EUR");
    assert.equal(euros.text, "101.00");
    assert.deepEqual(
      resolveAmount(euros.text, euros.expressionMode, "EUR"),
      M.create("101", "EUR"),
    );
  }
});

await test("currency normalization preserves blank and invalid input", () => {
  for (const text of ["", "  ", "1 +", "1 / 0", "-1"]) {
    const input = { text, expressionMode: true };
    assert.strictEqual(normalizeAmountInput(input, "JPY"), input);
  }
});

await test("currency normalization can keep negative adjustments", () => {
  const input = { text: "-100.50", expressionMode: false };
  assert.strictEqual(normalizeAmountInput(input, "JPY"), input);
  assert.equal(normalizeAmountInput(input, "JPY", true).text, "-101");
});

await test("empty amounts stay automatic", () => {
  for (const expressionMode of [false, true])
    for (const currency of ["EUR", "JPY"] as const) {
      assert.equal(resolveAmount("", expressionMode, currency), undefined);
      assert.equal(resolveAmount("  ", expressionMode, currency), undefined);
    }
});

await test("parseNumber retains decimal input text while accepting currency notation", () => {
  for (const [input, expected] of [
    ["12,5", "12.5"],
    ["€ 1 234,5", "1234.5"],
    ["abc", "0"],
    ["-12,5", "-12.5"],
    [" -100 ", "-100"],
    ["9007199254740993.01", "9007199254740993.01"],
  ])
    assert.equal(parseNumber(input), expected);
});

await test("calculations use exact arithmetic and round only the final result", () => {
  for (const [input, expected] of [
    ["12.5", "12.50"],
    ["10 + 2,5 * (4 - 2) / 5", "11.00"],
    ["2 + 3 * 4 - 6 / 2", "11.00"],
    ["10 - 2 - 3", "5.00"],
    ["-(1,5 + .5) * -2", "4.00"],
    ["7,", "7.00"],
    ["1 / 3 * 3", "1.00"],
    ["10 / 3", "3.33"],
    ["1.005", "1.01"],
    ["0.03 / 2", "0.02"],
    ["9007199254740993.01 + 0.01", "9007199254740993.02"],
  ]) {
    const amount = resolveAmount(input, true, "EUR");
    assert.ok(amount);
    assert.equal(M.toString(amount), expected);
  }
  assert.deepEqual(
    resolveAmount("100 / 3", true, "JPY"),
    M.create("33", "JPY"),
  );
});

await test("invalid calculations remain unresolved", () => {
  for (const input of [
    "1 +",
    "1 / 0",
    "(2",
    "abc",
    "",
    "alert(1)",
    "1 + 2)",
    "1 2",
    "1.2.3",
    "(".repeat(100_000) + "1",
  ])
    assert.equal(
      resolveAmount(input, true, "EUR"),
      undefined,
      input.slice(0, 20),
    );
  assert.deepEqual(
    resolveAmount("€ 12,5", false, "EUR"),
    M.create("12.5", "EUR"),
  );
});

await test("amount errors distinguish invalid input from unsupported ranges", () => {
  const tooLarge = "Amount is too large or has too many digits.";
  for (const [text, expressionMode, error] of [
    ["", false, ""],
    ["12,5", false, ""],
    ["1.2.3", false, "Invalid amount"],
    ["1 +", true, "Invalid calculation"],
    ["1 / 0", true, "Invalid calculation"],
    ["1".repeat(40), false, tooLarge],
    ["1".repeat(40), true, tooLarge],
    [`${"9".repeat(500)} * ${"9".repeat(500)}`, true, tooLarge],
  ] as const) {
    const result = readAmountInput(text, expressionMode, "EUR");
    assert.equal(result.error, error, text.slice(0, 20));
    assert.equal(result.amount === undefined, text === "" || error !== "");
  }
});

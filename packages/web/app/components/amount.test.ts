import assert from "node:assert/strict";
import { test } from "node:test";

import * as M from "@tasan/common/money";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LanguageContext } from "~/context";
import { formatAmount } from "~/domain/format-amount";

import { AmountWithConversion, MoneyRender } from "./amount";

const spaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
await test("amounts localize separators and currency placement", () => {
  const amount = M.create("1234.5", "EUR");
  assert.equal(spaces(formatAmount(amount, "fi-FI")), "1 234,50 EUR");
  assert.equal(spaces(formatAmount(amount, "en-US")), "EUR 1,234.50");
  assert.equal(spaces(formatAmount(amount, "de-DE")), "1.234,50 EUR");
  assert.equal(Number(M.toString(amount)), 1234.5);
  assert.equal(M.toString(amount), "1234.50");
});

await test("amounts preserve precision, currency codes, and balance signs", () => {
  assert.equal(
    spaces(formatAmount(M.create("1234", "JPY"), "fi-FI")),
    "1 234 JPY",
  );
  assert.equal(
    spaces(formatAmount(M.create("0", "EUR"), "fi-FI", "exceptZero")),
    "0,00 EUR",
  );
  assert.equal(
    spaces(formatAmount(M.create("12.5", "EUR"), "fi-FI", "exceptZero")),
    "+12,50 EUR",
  );
  assert.equal(
    spaces(formatAmount(M.create("-12.5", "EUR"), "en-US", "exceptZero")),
    "-EUR 12.50",
  );
  assert.throws(() => M.create("1.234", "EUR"), RangeError);
});

await test("amount components use the existing language context", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "fi-FI" },
      createElement(AmountWithConversion, {
        amount: M.create("1234.5", "EUR"),
        convertedAmount: M.create("2000", "JPY"),
      }),
    ),
  );
  assert.equal(
    spaces(html),
    "<span>1 234,50 EUR</span> (<span>2 000 JPY</span>)",
  );
});

await test("amounts without a conversion omit the parentheses and separator", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "en-US" },
      createElement(AmountWithConversion, {
        amount: M.create("10", "EUR"),
      }),
    ),
  );
  assert.equal(spaces(html), "<span>EUR 10.00</span>");
});

await test("zero amounts render with the currency precision", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "en-US" },
      createElement(AmountWithConversion, {
        amount: M.create("0.01", "EUR"),
        convertedAmount: M.create("0", "JPY"),
      }),
      createElement(MoneyRender, {
        amount: M.create("0", "JPY"),
      }),
    ),
  );
  assert.equal(
    spaces(html),
    "<span>EUR 0.01</span> (<span>JPY 0</span>)<span>JPY 0</span>",
  );
});

await test("formatting preserves minor units beyond Number precision", () => {
  const amount = M.create("9007199254740993.01", "EUR");
  assert.equal(
    spaces(formatAmount(amount, "en-US")),
    "EUR 9,007,199,254,740,993.01",
  );
  assert.equal(
    spaces(formatAmount(M.negate(amount), "fi-FI")),
    "−9 007 199 254 740 993,01 EUR",
  );
});

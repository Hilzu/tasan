import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/money";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LanguageContext } from "~/context";
import { formatAmount } from "~/domain/format-amount";

import { AmountRender, AmountWithConversion } from "./amount";

const spaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
await test("amounts localize separators and currency placement", () => {
  const amount = D.create("1234.5", "EUR");
  assert.equal(spaces(formatAmount(amount, "EUR", "fi-FI")), "1 234,50 EUR");
  assert.equal(spaces(formatAmount(amount, "EUR", "en-US")), "EUR 1,234.50");
  assert.equal(spaces(formatAmount(amount, "EUR", "de-DE")), "1.234,50 EUR");
  assert.equal(Number(D.toString(amount)), 1234.5);
  assert.equal(D.toString(amount), "1234.50");
});

await test("amounts preserve precision, currency codes, and balance signs", () => {
  assert.equal(
    spaces(formatAmount(D.create("1234", "JPY"), "JPY", "fi-FI")),
    "1 234 JPY",
  );
  assert.equal(
    spaces(formatAmount(D.create("0", "EUR"), "EUR", "fi-FI", "exceptZero")),
    "0,00 EUR",
  );
  assert.equal(
    spaces(formatAmount(D.create("12.5", "EUR"), "EUR", "fi-FI", "exceptZero")),
    "+12,50 EUR",
  );
  assert.equal(
    spaces(
      formatAmount(D.create("-12.5", "EUR"), "EUR", "en-US", "exceptZero"),
    ),
    "-EUR 12.50",
  );
  assert.throws(() => D.create("1.234", "EUR"), RangeError);
});

await test("amount components use the existing language context", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "fi-FI" },
      createElement(AmountWithConversion, {
        amount: D.create("1234.5", "EUR"),
        currency: "EUR",
        convertedAmount: D.create("2000", "JPY"),
        convertedCurrency: "JPY",
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
        amount: D.create("10", "EUR"),
        currency: "EUR",
        convertedCurrency: "EUR",
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
        amount: D.create("0.01", "EUR"),
        currency: "EUR",
        convertedAmount: D.create("0", "JPY"),
        convertedCurrency: "JPY",
      }),
      createElement(AmountRender, {
        amount: D.create("0", "JPY"),
        currency: "JPY",
      }),
    ),
  );
  assert.equal(
    spaces(html),
    "<span>EUR 0.01</span> (<span>JPY 0</span>)<span>JPY 0</span>",
  );
});

await test("formatting preserves minor units beyond Number precision and rejects currency mismatches", () => {
  const amount = D.create("9007199254740993.01", "EUR");
  assert.equal(
    spaces(formatAmount(amount, "EUR", "en-US")),
    "EUR 9,007,199,254,740,993.01",
  );
  assert.equal(
    spaces(formatAmount(D.negate(amount), "EUR", "fi-FI")),
    "−9 007 199 254 740 993,01 EUR",
  );
  assert.throws(() => formatAmount(amount, "USD", "en-US"), RangeError);
});

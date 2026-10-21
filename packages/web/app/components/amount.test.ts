import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LanguageContext } from "~/context";
import { formatAmount } from "~/domain/format-amount";

import { AmountRender } from "./amount";

const spaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

await test("amounts localize separators and currency placement", () => {
  const amount = D.create(1234.5);
  assert.equal(spaces(formatAmount(amount, "EUR", "fi-FI")), "1 234,50 EUR");
  assert.equal(spaces(formatAmount(amount, "EUR", "en-US")), "EUR 1,234.50");
  assert.equal(spaces(formatAmount(amount, "EUR", "de-DE")), "1.234,50 EUR");
  assert.equal(amount.value, 1234.5);
  assert.equal(D.toString(amount), "1234.50");
});

await test("amounts preserve precision, currency codes, and balance signs", () => {
  assert.equal(
    spaces(formatAmount(D.create(1234, 0), "JPY", "fi-FI")),
    "1 234 JPY",
  );
  assert.equal(
    spaces(formatAmount(D.create(0), "EUR", "fi-FI", "exceptZero")),
    "0,00 EUR",
  );
  assert.equal(
    spaces(formatAmount(D.create(12.5), "EUR", "fi-FI", "exceptZero")),
    "+12,50 EUR",
  );
  assert.equal(
    spaces(formatAmount(D.create(-12.5), "EUR", "en-US", "exceptZero")),
    "-EUR 12.50",
  );
  assert.equal(
    spaces(formatAmount(D.create(1.234, 3), "EUR", "en-US")),
    "EUR 1.234",
  );
});

await test("amount components use the existing language context", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "fi-FI" },
      createElement(AmountRender, {
        amount: D.create(1234.5),
        currency: "EUR",
      }),
    ),
  );
  assert.equal(spaces(html), "<span>1 234,50 EUR</span>");
});

await test("zero amounts render with the currency precision", () => {
  const html = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: "en-US" },
      createElement(AmountRender, {
        amount: D.create(0, 0),
        currency: "JPY",
      }),
    ),
  );
  assert.equal(spaces(html), "<span>JPY 0</span>");
});

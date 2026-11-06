import assert from "node:assert/strict";
import { test } from "node:test";

import {
  currencies,
  type CurrencySymbol,
  isCurrencySelectable,
  selectableCurrencies,
} from "./currency.js";

// Minor units from the ISO 4217 list published 2026-09-17. BGN uses its last
// listed value before it was withdrawn.
const isoMinorUnits: Record<string, number> = {
  AUD: 2,
  BGN: 2,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  ISK: 0,
  JPY: 0,
  KRW: 0,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PLN: 2,
  RON: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TRY: 2,
  USD: 2,
  ZAR: 2,
};

await test("currency precision follows ISO 4217 minor units", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(currencies).map(([symbol, { fractions }]) => [
        symbol,
        fractions,
      ]),
    ),
    isoMinorUnits,
  );
});

await test("historic currencies are selectable only where already in use", () => {
  const symbols = (inUse?: (CurrencySymbol | undefined)[]) =>
    selectableCurrencies(inUse).map(({ symbol }) => symbol);
  assert.equal(isCurrencySelectable("EUR"), true);
  assert.equal(isCurrencySelectable("BGN"), false);
  assert.equal(isCurrencySelectable("BGN", ["EUR", undefined]), false);
  assert.equal(isCurrencySelectable("BGN", ["EUR", "BGN"]), true);
  assert.ok(!symbols().includes("BGN"));
  assert.equal(symbols().length, Object.keys(currencies).length - 1);
  assert.ok(symbols(["EUR", "BGN"]).includes("BGN"));
  assert.deepEqual(selectableCurrencies().at(0), {
    symbol: "AUD",
    name: "Australian Dollar",
  });
});

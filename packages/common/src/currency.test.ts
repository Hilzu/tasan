import assert from "node:assert/strict";
import { test } from "node:test";

import { currencies } from "./currency.js";

await test("currency precision follows ISO 4217 minor units", () => {
  const entries = Object.entries(currencies);
  const withFractions = (fractions: number) =>
    entries
      .filter(([, info]) => info.fractions === fractions)
      .map(([symbol]) => symbol)
      .sort();
  assert.deepEqual(withFractions(0), ["ISK", "JPY", "KRW"]);
  assert.equal(
    withFractions(2).length + withFractions(0).length,
    entries.length,
  );
});

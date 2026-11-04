import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { fetchCurrencyConversionRate } from "./currency-convert.js";

await test("exchange rates reuse successful requests, expire, and separate currency pairs", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const fetch = mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      Response.json({ base: "USD", rates: { EUR: 0.9, JPY: 150 } }),
    ),
  );
  try {
    assert.deepEqual(
      await Promise.all([
        fetchCurrencyConversionRate("USD", "EUR"),
        fetchCurrencyConversionRate("USD", "EUR"),
      ]),
      ["0.9", "0.9"],
    );
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(await fetchCurrencyConversionRate("USD", "EUR"), "0.9");
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(await fetchCurrencyConversionRate("USD", "JPY"), "150");
    assert.equal(fetch.mock.callCount(), 2);
    t.mock.timers.tick(60 * 60 * 1000);
    await fetchCurrencyConversionRate("USD", "EUR");
    assert.equal(fetch.mock.callCount(), 3);
  } finally {
    fetch.mock.restore();
  }
});

await test("failed and invalid exchange rates are not cached", async () => {
  const fetch = mock.method(globalThis, "fetch", () =>
    Promise.resolve(new Response(null, { status: 503 })),
  );
  try {
    await assert.rejects(() => fetchCurrencyConversionRate("GBP", "EUR"));
    fetch.mock.mockImplementation(() =>
      Promise.resolve(Response.json({ base: "GBP", rates: { EUR: 0 } })),
    );
    await assert.rejects(() => fetchCurrencyConversionRate("GBP", "EUR"));
    fetch.mock.mockImplementation(() =>
      Promise.resolve(Response.json({ base: "GBP", rates: { EUR: 1.2 } })),
    );
    assert.equal(await fetchCurrencyConversionRate("GBP", "EUR"), "1.2");
    assert.equal(fetch.mock.callCount(), 3);
  } finally {
    fetch.mock.restore();
  }
});

await test("rate ingestion preserves the exact published JSON decimal and exponent notation", async () => {
  const fetch = mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(
        '{"base":"INR","rates":{"EUR":0.12345678901234567890123456789012345678,"JPY":1.25e-7}}',
      ),
    ),
  );
  try {
    assert.equal(
      await fetchCurrencyConversionRate("INR", "EUR"),
      "0.12345678901234567890123456789012345678",
    );
    assert.equal(
      await fetchCurrencyConversionRate("INR", "JPY"),
      "0.000000125",
    );
  } finally {
    fetch.mock.restore();
  }
});

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

await test("rates keep the JS number's decimal text and reject out-of-range values", async () => {
  const fetch = mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response('{"base":"INR","rates":{"EUR":0.012345678901234567}}'),
    ),
  );
  try {
    assert.equal(
      await fetchCurrencyConversionRate("INR", "EUR"),
      String(0.012345678901234567),
    );
    fetch.mock.mockImplementation(() =>
      Promise.resolve(new Response('{"base":"INR","rates":{"JPY":1.25e-7}}')),
    );
    await assert.rejects(() => fetchCurrencyConversionRate("INR", "JPY"));
  } finally {
    fetch.mock.restore();
  }
});

await test("fixed euro currencies convert through the euro without provider pairs", async () => {
  const fetch = mock.method(globalThis, "fetch", (url: string) =>
    Promise.resolve(
      url.includes("from=EUR") ?
        Response.json({ base: "EUR", rates: { SEK: 11, CHF: 0.94 } })
      : Response.json({ message: "not found" }, { status: 404 }),
    ),
  );
  try {
    assert.equal(await fetchCurrencyConversionRate("EUR", "BGN"), "1.95583");
    assert.equal(
      await fetchCurrencyConversionRate("BGN", "EUR"),
      "0.511291881196218",
    );
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(
      await fetchCurrencyConversionRate("BGN", "SEK"),
      "5.6242106931584",
    );
    assert.equal(
      await fetchCurrencyConversionRate("CHF", "BGN"),
      "2.08067021276596",
    );
    assert.deepEqual(
      fetch.mock.calls.map((call) => call.arguments[0]),
      [
        "https://api.frankfurter.dev/v1/latest?from=EUR&to=SEK",
        "https://api.frankfurter.dev/v1/latest?from=EUR&to=CHF",
      ],
    );
  } finally {
    fetch.mock.restore();
  }
});

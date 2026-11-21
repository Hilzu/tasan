const realFetch = globalThis.fetch;

// Stub only the external provider; conversion and persistence stay in the app.
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://api.frankfurter.dev")
    return realFetch(input, init);
  if (
    url.pathname !== "/v1/latest" ||
    url.searchParams.get("from") !== "USD" ||
    url.searchParams.get("to") !== "EUR"
  )
    throw new Error(`Unconfigured E2E exchange-rate request: ${url.href}`);
  return Promise.resolve(Response.json({ base: "USD", rates: { EUR: 0.8 } }));
};

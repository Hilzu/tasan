import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAcceptLanguage } from "~/.server/accept-language";

await test("missing, wildcard, and invalid language headers use the default locale", () => {
  for (const header of [
    null,
    "",
    " ",
    "*",
    " *;q=0.8 ",
    "*, en;q=0.9",
    "en_US",
  ]) {
    assert.equal(parseAcceptLanguage(header), undefined);
  }
});

await test("valid language headers preserve the first language preference", () => {
  for (const [header, expected] of [
    ["fi", "fi"],
    ["en-US,en;q=0.9", "en-US"],
    [" fi-FI ;q=0.8, en;q=0.7", "fi-FI"],
    ["en-us", "en-US"],
    ["ja-JP, *;q=0.5", "ja-JP"],
  ]) {
    assert.equal(parseAcceptLanguage(header), expected);
  }
});

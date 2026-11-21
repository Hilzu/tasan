import assert from "node:assert/strict";
import { test } from "node:test";

import { toRelativePath } from "~/url";

await test("protocol-relative and normalized external redirects fall back to root", () => {
  for (const url of [
    "//evil.example",
    "/.//evil.example",
    "\\\\evil.example",
    "/.\\\\evil.example",
    "https://evil.example/path",
  ]) {
    assert.equal(toRelativePath(url), "/", url);
  }
});

await test("local redirects preserve path and query", () => {
  assert.equal(toRelativePath("/splits?sort=name"), "/splits?sort=name");
});

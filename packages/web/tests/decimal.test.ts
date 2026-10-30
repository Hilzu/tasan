import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "@tasan/common/decimal";

await test("decimal multiplication rounds exact half units away from zero", () => {
  for (const [value, rate, expected] of [
    [86500, 0.00565, 488.73],
    [0.15, 0.7, 0.11],
    [0.03, 0.5, 0.02],
    [1, 1.005, 1.01],
    [-1, 1.005, -1.01],
    [1, -1.005, -1.01],
    [-1, -1.005, 1.01],
    [1, 1.0049999999999997, 1],
    [-1, 1.0049999999999997, -1],
    [0, 1.005, 0],
  ]) {
    assert.deepEqual(D.mul(D.create(value), rate), D.create(expected));
  }
});

await test("decimal multiplication preserves source precision and accepts a target precision", () => {
  assert.deepEqual(D.mul(D.create(86500, 0), 0.00565, 2), D.create(488.73));
  assert.deepEqual(D.mul(D.create(86500, 0), 0.00565), D.create(489, 0));
  assert.deepEqual(D.mul(D.create(1.49), 160, 0), D.create(238, 0));
  assert.deepEqual(D.mul(D.create(1.5), 1, 0), D.create(2, 0));
  assert.deepEqual(D.mul(D.create(-1.5), 1, 0), D.create(-2, 0));
  assert.deepEqual(
    D.mul(D.create(86500, 0), D.create(0.00565, 5), 2),
    D.create(488.73),
  );
});

await test("decimal multiplication handles exponent notation without losing its digits", () => {
  assert.deepEqual(D.mul(D.create(10000, 0), 5e-7, 2), D.create(0.01));
  assert.deepEqual(D.mul(D.create(1), 1.25e-7, 9), D.create(0.000000125, 9));
  assert.deepEqual(D.mul(D.create(1.25), 1e21), D.create(1.25e21));
});

await test("decimal multiplication rejects non-finite operands", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => D.mul(D.create(1), value), RangeError);
    assert.throws(() => D.mul(D.create(value), 1), RangeError);
  }
});

await test("allocated products preserve the rounded total and caller order for ties", () => {
  const parts = [D.create(0.01), D.create(0.01), D.create(0.01)];
  const before = structuredClone(parts);
  assert.deepEqual(D.mulAndAllocate(D.create(0.03), parts, 0.5), {
    total: D.create(0.02),
    parts: [D.create(0.01), D.create(0.01), D.create(0)],
  });
  assert.deepEqual(parts, before);
});

await test("allocated products compare remainders exactly across decimal scales", () => {
  assert.deepEqual(
    D.mulAndAllocate(
      D.create(0.04),
      [D.create(0.01), D.create(0.03)],
      0.5000000001,
    ),
    { total: D.create(0.02), parts: [D.create(0), D.create(0.02)] },
  );
  assert.deepEqual(
    D.mulAndAllocate(D.create(1.1), [D.create(1), D.create(0.1)], 0.05),
    { total: D.create(0.06), parts: [D.create(0.05), D.create(0.01)] },
  );
});

await test("allocated products handle signed parts and zero totals", () => {
  assert.deepEqual(
    D.mulAndAllocate(D.create(0.01), [D.create(-0.01), D.create(0.02)], 0.5),
    { total: D.create(0.01), parts: [D.create(0), D.create(0.01)] },
  );
  assert.deepEqual(D.mulAndAllocate(D.create(0), [], 0.5), {
    total: D.create(0),
    parts: [],
  });
});

await test("allocated products require parts to sum exactly to the source total", () => {
  assert.throws(
    () => D.mulAndAllocate(D.create(1), [D.create(0.99)], 0),
    RangeError,
  );
});

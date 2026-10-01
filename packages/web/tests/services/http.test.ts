import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationError } from "~/.server/services/errors";
import { errorResponse, formErrorResponse } from "~/.server/services/http";

await test("missing resources produce a 404 response", () => {
  assert.equal(
    errorResponse(new ApplicationError("not_found", "Missing")).status,
    404,
  );
  assert.throws(
    () => formErrorResponse(new ApplicationError("not_found", "Missing")),
    (error: unknown) => error instanceof Response && error.status === 404,
  );
});

await test("unexpected failures are rethrown unchanged", () => {
  const failure = new Error("Storage unavailable");
  assert.throws(
    () => errorResponse(failure),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => formErrorResponse(failure),
    (error: unknown) => error === failure,
  );
});

await test("invalid input produces field errors and a 400 response", () => {
  const response = formErrorResponse(
    new ApplicationError("invalid_input", "Invalid payer", {
      payer: ["Invalid payer"],
    }),
  );
  assert.equal(response.init?.status, 400);
  assert.deepEqual(response.data.errors.fieldErrors, {
    payer: ["Invalid payer"],
  });
});

await test("form errors map application names to explicit browser field names", () => {
  const error = new ApplicationError("invalid_input", "Invalid input", {
    name: ["Name is too long"],
    currency: ["Invalid currency"],
  });
  for (const field of ["splitName", "expenseName"]) {
    const response = formErrorResponse(error, { name: field });
    assert.deepEqual(response.data.errors.fieldErrors, {
      [field]: ["Name is too long"],
      currency: ["Invalid currency"],
    });
  }
  assert.deepEqual(error.fieldErrors, {
    name: ["Name is too long"],
    currency: ["Invalid currency"],
  });
});

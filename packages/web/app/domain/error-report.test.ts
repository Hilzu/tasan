import assert from "node:assert/strict";
import { test } from "node:test";

import { errorDetails } from "./error-report";

await test("error details include production browser exceptions and remove URL secrets", () => {
  const error = new TypeError("Unexpected result");
  error.stack =
    "TypeError: Unexpected result\n at submit (https://tasan.app/assets/app.js?token=secret#private:1:20)\n at https://tasan.app/accept-invite/bearer-token";
  const details = errorDetails(error);
  assert.equal(details.name, "TypeError");
  assert.equal(details.message, "Unexpected result");
  assert.ok(details.stack.includes("https://tasan.app/assets/app.js"));
  assert.ok(!details.stack.includes("secret"));
  assert.ok(!details.stack.includes("bearer-token"));
});

await test("does not serialize arbitrary thrown data or HTTP response bodies", () => {
  assert.deepEqual(errorDetails({ password: "secret" }), {
    name: "Error",
    message: "An unexpected error occurred.",
    stack: "",
  });
  assert.deepEqual(
    errorDetails({
      status: 403,
      statusText: "Forbidden",
      internal: false,
      data: "secret",
    }),
    {
      name: "HTTP 403",
      message: "Forbidden",
      stack: "",
    },
  );
});

await test("limits unusually long browser errors to report field limits", () => {
  const error = new Error("x".repeat(3000));
  error.name = "x".repeat(300);
  error.stack = "x".repeat(20000);
  const details = errorDetails(error);
  assert.equal(details.name.length, 200);
  assert.equal(details.message.length, 2000);
  assert.equal(details.stack.length, 12000);
});

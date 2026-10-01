import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { asCognitoUserID, genUserID } from "@tasan/common/id";
import type { ensureCognitoUser, putUser } from "@tasan/data";

const userID = genUserID();
const persistenceMock = {
  cache: true,
  exports: {
    ensureCognitoUser: mock.fn<typeof ensureCognitoUser>(() =>
      Promise.resolve({ userID }),
    ),
    putUser: mock.fn<typeof putUser>(() => Promise.resolve()),
  },
};
// eslint-disable-next-line n/no-unsupported-features/node-builtins
mock.module("@tasan/data", persistenceMock);
const { provisionAuthenticatedUser } = await import("~/.server/services/users");

await test("provisioning saves the profile under the resolved application identity", async () => {
  const cognitoID = asCognitoUserID("12345678-1234-4123-8123-123456789abc");
  assert.deepEqual(
    await provisionAuthenticatedUser({
      cognitoID,
      email: "user@example.com",
      name: "User",
    }),
    { userID },
  );
  assert.deepEqual(
    persistenceMock.exports.ensureCognitoUser.mock.calls[0].arguments,
    [{ cognitoID }],
  );
  assert.equal(persistenceMock.exports.putUser.mock.callCount(), 1);
  assert.deepEqual(persistenceMock.exports.putUser.mock.calls[0].arguments, [
    { id: userID, email: "user@example.com", name: "User" },
  ]);
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";

const persistenceMock = {
  cache: true,
  exports: { getUser: () => Promise.resolve(null) },
};
mock.module("@tasan/data", persistenceMock);
const sessionMock = {
  cache: true,
  exports: { getSession: () => Promise.resolve({ get: () => undefined }) },
};
mock.module("~/.server/sessions", sessionMock);

const { getSessionOrRedirect, getUserOrRedirect } =
  await import("~/.server/auth");

for (const getAuth of [getSessionOrRedirect, getUserOrRedirect]) {
  await test(`${getAuth.name} saves the page URL for login after a data request`, async () => {
    const request = new Request(
      "https://tasan.app/splits.data?_routes=routes/splits/list-splits&sort=name",
    );
    const response = await getAuth(
      request,
      new URL("https://tasan.app/splits?sort=name"),
    );
    assert.ok(response instanceof Response);
    assert.equal(response.status, 302);
    const redirectLocation = response.headers.get("location");
    assert.ok(redirectLocation);
    const location = new URL(redirectLocation, request.url);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("redirect"), "/splits?sort=name");
  });

  await test(`${getAuth.name} preserves document navigation destinations`, async () => {
    const request = new Request(
      "https://tasan.app/splits/example?tab=expenses",
    );
    const response = await getAuth(request, new URL(request.url));
    assert.ok(response instanceof Response);
    const redirectLocation = response.headers.get("location");
    assert.ok(redirectLocation);
    const location = new URL(redirectLocation, request.url);
    assert.equal(
      location.searchParams.get("redirect"),
      "/splits/example?tab=expenses",
    );
  });
}

import { expect, test } from "./fixtures";

test("settings persist a locale and reject invalid input", async ({
  owner,
}) => {
  await owner.goto("/settings");
  const locale = owner.getByLabel("Locale", { exact: true });
  const previous = await locale.inputValue();
  try {
    await locale.fill("fi-FI");
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByRole("status")).toHaveText("Settings saved.");
    await owner.reload();
    await expect(
      owner.getByText("Current format (fi-FI)", { exact: true }),
    ).toBeVisible();
    await expect(owner.getByText(/1\s?234,56/)).toBeVisible();

    await locale.fill("not a locale");
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByText("Choose a valid locale.")).toBeVisible();
    await owner.reload();
    await expect(
      owner.getByText("Current format (fi-FI)", { exact: true }),
    ).toBeVisible();
  } finally {
    await locale.fill(previous);
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByRole("status")).toHaveText("Settings saved.");
  }
});

test("local bypass sessions are revoked on logout", async ({ owner }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL),
    "Deployed tests reuse saved Cognito sessions.",
  );
  const sessionCookie = (await owner.context().cookies()).find(
    (cookie) => cookie.name === "__session",
  );
  if (!sessionCookie) throw new Error("Sign-in did not set a session cookie.");
  const account = owner.getByLabel(/^Account menu for /);
  await account.click();
  await owner.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    owner.getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
  const protectedPage = await owner.request.get("/splits", {
    maxRedirects: 0,
    headers: { cookie: `__session=${sessionCookie.value}` },
  });
  expect(protectedPage.status()).toBe(302);
  expect(protectedPage.headers().location).toContain("/login");
});

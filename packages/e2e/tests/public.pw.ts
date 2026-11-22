import { expect, test } from "@playwright/test";

test("serves the expected deployment version", async ({ request }) => {
  const expectedVersion = process.env.E2E_EXPECTED_VERSION;
  test.skip(!expectedVersion, "No expected deployment version was provided.");

  const response = await request.get("/version");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ version: expectedVersion });
});

test("HEAD requests return document headers without a body", async ({
  request,
}) => {
  const response = await request.head("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  expect(response.headers()["content-security-policy"]).toContain("nonce-");
  expect((await response.body()).length).toBe(0);
});

test("example selection works without JavaScript", async ({ page }) => {
  await page.route("**/assets/entry.client-*.js", (route) => route.abort());

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  const examples = page.getByRole("navigation", {
    name: "Choose an example split",
  });
  await examples.getByRole("link", { name: "Dinner out" }).click();

  await expect(page).toHaveURL("/?example=dinner-out");
  await expect(
    examples.getByRole("link", { name: "Dinner out" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("region", { name: "Dinner out example split" }),
  ).toBeVisible();
});

test("visitors can explore examples and navigate to the privacy notice", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: /Good times/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  const examples = page.getByRole("navigation", {
    name: "Choose an example split",
  });
  await examples.getByRole("link", { name: "Dinner out" }).click();
  await expect(
    examples.getByRole("link", { name: "Dinner out" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("region", { name: "Dinner out example split" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy notice" }),
  ).toBeVisible();
});

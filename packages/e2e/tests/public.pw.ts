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

test("visitors can explore examples and navigate to the privacy notice", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: /Good times/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  const examples = page.getByRole("group", { name: "Choose an example split" });
  await examples.getByRole("button", { name: "Dinner out" }).click();
  await expect(
    examples.getByRole("button", { name: "Dinner out" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Dinner out example split" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy notice" }),
  ).toBeVisible();
});

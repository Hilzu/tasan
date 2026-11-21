import { expect, test } from "@playwright/test";

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

import {
  type Browser,
  expect,
  type Page,
  test as base,
} from "@playwright/test";

import { localUsers } from "../users.ts";

type UserRole = keyof typeof localUsers;

async function withUser(
  role: UserRole,
  browser: Browser,
  baseURL: string | undefined,
  use: (page: Page) => Promise<void>,
) {
  const deployed = Boolean(process.env.E2E_BASE_URL);
  const stateKey = `E2E_${role.toUpperCase()}_STORAGE_STATE`;
  const storageState = process.env[stateKey];
  if (deployed && process.env.E2E_ALLOW_MUTATIONS !== "1")
    throw new Error(
      "Deployed journey tests create financial records. Use dedicated test accounts and set E2E_ALLOW_MUTATIONS=1.",
    );
  if (deployed && !storageState)
    throw new Error(
      `Set ${stateKey} to a signed-in test account's state file.`,
    );

  const context = await browser.newContext({
    baseURL,
    locale: "en-GB",
    storageState: deployed ? storageState : undefined,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    if (!deployed) {
      await page.goto("/create-session");
      await page.getByLabel("User ID").fill(localUsers[role].id);
      await page.getByRole("button", { name: "Create", exact: true }).click();
    } else await page.goto("/splits");
    await expect(
      page.getByRole("heading", { name: "Your splits" }),
    ).toBeVisible();
    await use(page);
    expect(errors, "Uncaught browser errors").toEqual([]);
  } finally {
    await context.close();
  }
}

export const test = base.extend<{
  owner: Page;
  member: Page;
  outsider: Page;
}>({
  owner: async ({ browser, baseURL }, use) =>
    withUser("owner", browser, baseURL, use),
  member: async ({ browser, baseURL }, use) =>
    withUser("member", browser, baseURL, use),
  outsider: async ({ browser, baseURL }, use) =>
    withUser("outsider", browser, baseURL, use),
});

export { expect } from "@playwright/test";

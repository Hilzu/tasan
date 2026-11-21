import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

function card(page: Page, heading: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
}

function descriptionValue(scope: Page | Locator, label: string) {
  return scope
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::dd[1]");
}

async function createSplit(page: Page) {
  const name = `E2E ${randomUUID()}`;
  await page.goto("/splits");
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Home currency").selectOption("EUR");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Split - ${name}` }),
  ).toBeVisible();
  return { name, path: new URL(page.url()).pathname };
}

async function inviteMember(owner: Page, member: Page, name: string) {
  await owner.getByRole("link", { name: "Invite", exact: true }).click();
  await owner.getByRole("button", { name: "Invite", exact: true }).click();
  const invitation = owner.getByRole("link", { name: /\/accept-invite\// });
  await expect(invitation).toBeVisible();
  const url = await invitation.getAttribute("href");
  if (!url) throw new Error("Invitation link is missing its URL");
  await member.goto(url);
  await expect(
    member.getByRole("heading", { name: `Accept invite to ${name} split?` }),
  ).toBeVisible();
  await member.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    member.getByRole("heading", { name: `Split - ${name}` }),
  ).toBeVisible();
  return url;
}

async function deleteEntry(page: Page, kind: "Expense" | "Payment") {
  await page.getByLabel(`${kind} actions`).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel(`${kind} actions`).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Split - / })).toBeVisible();
}

async function expectMoney(locator: Locator, amount: string) {
  await expect(locator).toContainText(
    new RegExp(
      `(?<!\\d)${amount.replace(".", "[.,]")}\\s*EUR|EUR\\s*${amount.replace(".", "[.,]")}(?!\\d)`,
    ),
  );
}

test("create a split, invite a friend, edit expenses, settle up and delete entries", async ({
  owner,
  member,
  outsider,
}) => {
  const split = await createSplit(owner);
  const inviteURL = await inviteMember(owner, member, split.name);

  // The error screen checks the session on mount. Let that request finish
  // before navigating away, because WebKit reports a fetch cancelled by
  // navigation as an uncaught page error.
  const gotoErrorScreen = async (url: string) => {
    const sessionCheck = outsider.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/error-report" &&
        response.request().method() === "GET",
    );
    const response = await outsider.goto(url);
    await sessionCheck;
    return response;
  };
  const denied = await gotoErrorScreen(split.path);
  expect(denied?.status()).toBe(404);
  const usedInvite = await gotoErrorScreen(inviteURL);
  expect(usedInvite?.status()).toBe(404);
  await expect(
    outsider.getByRole("button", { name: "Accept", exact: true }),
  ).toHaveCount(0);

  await owner.goto(split.path);
  await owner.getByRole("link", { name: "New expense" }).click();
  await expect(owner.getByRole("checkbox")).toHaveCount(2);
  await owner.getByLabel("Name", { exact: true }).fill("E2E dinner");
  await owner.getByLabel("Total", { exact: true }).fill("0");
  await expect(
    owner.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  await owner.getByLabel("Total", { exact: true }).fill("20");
  await owner.getByRole("button", { name: "Create", exact: true }).click();
  await expectMoney(
    descriptionValue(card(owner, "Summary"), "Total expenses"),
    "20.00",
  );
  await owner.getByRole("link", { name: "E2E dinner", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "Expense - E2E dinner" }),
  ).toBeVisible();

  await owner.getByLabel("Expense actions").click();
  await owner.getByRole("link", { name: "Edit", exact: true }).click();
  await owner.getByLabel("Name", { exact: true }).fill("E2E dinner edited");
  await owner.getByLabel("Total", { exact: true }).fill("30");
  const amounts = owner.getByLabel(/ amount$/);
  await amounts.nth(0).fill("15");
  await amounts.nth(1).fill("15");
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(
    owner.getByRole("heading", { name: "Expense - E2E dinner edited" }),
  ).toBeVisible();
  await owner.reload();
  await expectMoney(descriptionValue(owner, "Amount"), "30.00");
  await owner.getByText("Expense history", { exact: true }).click();
  await expect(owner.getByText(/^created by /)).toBeVisible();
  await expect(owner.getByText(/^edited by /)).toBeVisible();

  await member.goto(split.path);
  await expectMoney(
    descriptionValue(card(member, "Summary"), "Your share"),
    "15.00",
  );
  await expectMoney(
    descriptionValue(card(member, "Summary"), "Total expenses"),
    "30.00",
  );
  const repayment = member.getByRole("button", {
    name: /^Record payment from /,
  });
  await expectMoney(repayment, "15.00");
  await repayment.click();
  const dialog = member.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(repayment).toBeVisible();
  await repayment.click();
  await dialog
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    member.getByText("No debts between participants. You are all settled!"),
  ).toBeVisible();
  await owner.goto(split.path);
  const payment = card(owner, "Recorded payments").getByRole("link");
  await expect(payment).toHaveCount(1);
  await payment.click();
  await deleteEntry(owner, "Payment");
  await expect(
    owner.getByRole("button", { name: /^Record payment from / }),
  ).toBeVisible();
  await owner
    .getByRole("link", { name: "E2E dinner edited", exact: true })
    .click();
  await deleteEntry(owner, "Expense");
  await member.goto(split.path);
  await expect(member.getByText("No expenses yet.")).toBeVisible();
  await expectMoney(
    descriptionValue(card(member, "Summary"), "Total expenses"),
    "0.00",
  );
  await expect(
    member.getByText("No debts between participants. You are all settled!"),
  ).toBeVisible();
  await owner.goto("/splits");
  await expect(
    owner.getByRole("link", { name: split.name, exact: true }),
  ).toBeVisible();
});

test("shares, adjustments and calculations preserve exact allocations", async ({
  owner,
  member,
}) => {
  const split = await createSplit(owner);
  await inviteMember(owner, member, split.name);
  await owner.goto(`${split.path}/new-expense`);
  await owner.getByLabel("Name", { exact: true }).fill("E2E shared meal");
  await owner.getByLabel("Total", { exact: true }).fill("24");
  await owner.getByRole("radio", { name: "Shares and adjustments" }).check();
  const save = owner.getByRole("button", { name: "Create", exact: true });
  await expect(save).toBeDisabled();
  await owner.getByRole("button", { name: "Even shares" }).click();
  const shares = owner.getByLabel("Shares", { exact: true });
  const adjustments = owner.getByLabel("Adjustment", { exact: true });
  await shares.nth(0).fill("2");
  await adjustments.nth(0).fill("6");
  await expect(save).toBeEnabled();
  await save.click();
  const expense = owner.getByRole("link", {
    name: "E2E shared meal",
    exact: true,
  });
  await expense.click();
  await expectMoney(owner.locator("main"), "18.00");
  await expectMoney(owner.locator("main"), "6.00");
  await deleteEntry(owner, "Expense");

  await owner.goto(`${split.path}/new-expense`);
  await owner.getByLabel("Name", { exact: true }).fill("E2E calculated total");
  const total = owner.getByLabel("Total", { exact: true });
  await total.locator("..").getByTitle("Enter a calculation").click();
  await total.fill("10 + 2 * 5");
  await save.click();
  await expectMoney(
    descriptionValue(card(owner, "Summary"), "Total expenses"),
    "20.00",
  );
  await owner
    .getByRole("link", { name: "E2E calculated total", exact: true })
    .click();
  await deleteEntry(owner, "Expense");

  await owner.goto(`${split.path}/new-expense`);
  await owner.getByLabel("Name", { exact: true }).fill("E2E exact amounts");
  const amounts = owner.getByLabel(/ amount$/);
  await amounts.nth(0).fill("12.34");
  await amounts.nth(1).fill("7.66");
  await save.click();
  await expectMoney(
    descriptionValue(card(owner, "Summary"), "Total expenses"),
    "20.00",
  );
  await owner
    .getByRole("link", { name: "E2E exact amounts", exact: true })
    .click();
  await expectMoney(descriptionValue(owner, "Participants"), "12.34");
  await expectMoney(descriptionValue(owner, "Participants"), "7.66");
  await deleteEntry(owner, "Expense");
});

test("foreign currency expenses retain the original and converted amounts", async ({
  owner,
}) => {
  const split = await createSplit(owner);
  await owner.goto(`${split.path}/new-expense`);
  await owner.getByLabel("Name", { exact: true }).fill("E2E dollars");
  await owner.getByLabel("Currency").selectOption("USD");
  await owner.getByLabel("Total", { exact: true }).fill("10");
  await owner.getByRole("button", { name: "Create", exact: true }).click();
  await owner.getByRole("link", { name: "E2E dollars", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "Expense - E2E dollars" }),
  ).toBeVisible();
  await owner.reload();
  const amount = descriptionValue(owner, "Amount");
  await expect(amount).toContainText(/10[.,]00/);
  await expect(amount).toContainText(/\(.*EUR.*\)/);
  await expect(descriptionValue(owner, "Exchange rate")).not.toHaveText("-");
  if (!process.env.E2E_BASE_URL) await expectMoney(amount, "8.00");
  await deleteEntry(owner, "Expense");
});

import { expect, type Page } from "@playwright/test";

// English, or Hebrew for the right-to-left tests.
const ACCOUNT_MENU = /^(Account, theme and language|חשבון, ערכת נושא ושפה)$/;

/** The visible account menu button (the sidebar's on desktop, the top bar's on phones). */
export function accountMenuButton(page: Page) {
  return page.getByRole("button", { name: ACCOUNT_MENU }).filter({ visible: true }).first();
}

/** Signed in as `email`: the shell is showing, and the account menu says who. */
export async function expectSignedIn(page: Page, email: string) {
  await expect(page.locator("#main")).toBeVisible();
  await accountMenuButton(page).click();
  await expect(page.getByRole("menu").getByText(email, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
}

export async function signOutFromMenu(page: Page) {
  await accountMenuButton(page).click();
  await page.getByRole("menuitem", { name: /Sign out|התנתקות/ }).click();
}

export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

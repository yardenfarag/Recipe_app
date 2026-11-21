import { expect, test } from "@playwright/test";

import { resetTestUserLanguage } from "./admin";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

test.afterEach(async () => {
  await resetTestUserLanguage();
});

test.beforeEach(async ({ page }) => {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the five sections navigate with real links, and Back works", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await nav.getByRole("link", { name: "Hub" }).click();
    await expect(page).toHaveURL(/\/app\/hub$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cooking Hub");
    await expect(page).toHaveTitle("Hub · Pinch");
    await expect(nav.getByRole("link", { name: "Hub" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "List" }).click();
    await expect(page).toHaveURL(/\/app\/list$/);
    await nav.getByRole("link", { name: "Snap a recipe" }).click();
    await expect(page).toHaveURL(/\/app\/add$/);
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/add$/);

    // A real link: it has an address, so it can open in a new tab.
    await expect(nav.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("href", "/app");
  });

  test("the whole shell works from the keyboard", async ({ page }) => {
    await page.goto("/app/hub");
    await expect(page.locator("#main h1")).toBeVisible();

    // The first Tab reaches the skip link, which jumps past the navigation.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);

    // Tab order follows the screen: logo, Snap, then the sections.
    await page.goto("/app/hub");
    await expect(page.locator("#main h1")).toBeVisible();
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // logo
    await page.keyboard.press("Tab");
    // The sidebar's Snap (an empty Library has its own "Snap a recipe" button further down).
    await expect(page.getByRole("link", { name: "Snap a recipe" }).filter({ visible: true }).first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Library", exact: true }).filter({ visible: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);

    // The account menu opens with Enter, moves with the arrow keys, and Escape closes it, returning focus.
    const accountButton = page.getByRole("button", { name: "Account, theme and language" }).filter({ visible: true });
    await accountButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    // Opening from the keyboard puts focus on the first item.
    await expect(page.getByRole("menuitem", { name: /Appearance/ })).toBeFocused();
    await page.keyboard.press("ArrowRight"); // opens the submenu
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeVisible();
    await page.getByRole("menuitemradio", { name: "Dark" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(accountButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(accountButton).toBeFocused();
  });

  test("theme and language choices apply at once and survive a reload", async ({ page }) => {
    const accountButton = page.getByRole("button", { name: "Account, theme and language" }).filter({ visible: true });
    await accountButton.click();
    await page.getByRole("menuitem", { name: /Color theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Dracula Drift" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-pack", "dracula");

    await accountButton.click();
    await page.getByRole("menuitem", { name: /Language/ }).click();
    await page.getByRole("menuitemradio", { name: "עברית" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#main h1")).toHaveText("המתכונים שלכם");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-pack", "dracula");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#main h1")).toHaveText("המתכונים שלכם");

  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the bottom bar reaches every section", async ({ page }) => {
    const bar = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(bar.getByRole("link")).toHaveCount(5);
    await bar.getByRole("link", { name: "Snap" }).tap();
    await expect(page).toHaveURL(/\/app\/add$/);
    await bar.getByRole("link", { name: "List" }).tap();
    await expect(page.locator("#main h1")).toHaveText("List");
    await expect(bar.getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
  });
});

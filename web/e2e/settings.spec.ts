import { expect, test, type Page } from "@playwright/test";

import { createUser, resetTestUserLanguage, uniqueEmail } from "./admin";
import { signInWithPassword } from "./helpers";
import { setPantryStaples } from "./listSeed";
import { canSignIn, readProfileSettings, resetTestUserSettings, writeProfileSettings } from "./settingsSeed";
import { TEST_USER } from "./testUser";

// Settings (PIN-139). Everything is saved on the account, which is what the mobile app reads, so "applies on the
// other app after a refresh" is checked on the account itself. Theme, language and spoons/grams: prefs-sync.spec.ts.

test.use({ locale: "en-US" });

test.afterEach(async () => {
  await resetTestUserLanguage();
  await resetTestUserSettings();
  await setPantryStaples([]);
});

async function signIn(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, email, password);
  await expect(page.locator("#main h1")).toBeVisible();
}

const main = (page: Page) => page.locator("#main");

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the menu and the open page sit side by side, and the menu's links change the page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings");
    const menu = main(page).getByRole("navigation", { name: "Settings" });
    await expect(menu).toBeVisible();
    // The settings home opens Account beside the menu.
    await expect(page.locator("#main h1")).toHaveText("Account");
    await expect(main(page).getByText(TEST_USER.email, { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");

    await menu.getByRole("link", { name: "Appearance" }).click();
    await expect(page).toHaveURL(/\/app\/settings\/appearance$/);
    await expect(page.locator("#main h1")).toHaveText("Appearance");
    await expect(page).toHaveTitle("Appearance · Pinch");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    const headingBox = await page.locator("#main h1").boundingBox();
    expect(menuBox!.x).toBeLessThan(headingBox!.x);

    // Appearance applies at once.
    await main(page).getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
    await main(page).getByRole("radio", { name: "Dracula Drift" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-pack", "dracula");
  });

  test("a recipe preference changed here is saved on the account, and one saved on the phone shows after a refresh", async ({ page }) => {
    await resetTestUserSettings();
    await signIn(page);
    await page.goto("/app/settings/recipe");
    await expect(page.locator("#main h1")).toHaveText("Recipe preferences");

    await main(page).getByRole("button", { name: "Vegan" }).click();
    await expect(main(page).getByRole("button", { name: "Vegan" })).toHaveAttribute("aria-pressed", "true");
    await expect(main(page).getByRole("status").getByText("Saved")).toBeVisible();
    await expect.poll(async () => (await readProfileSettings()).kitchen?.diets).toEqual(["vegan"]);

    await main(page).getByRole("switch", { name: "Share recipes I snap from public links in the Cooking Hub" }).click();
    await expect.poll(async () => (await readProfileSettings()).contribute_to_hub).toBe(false);

    // The mobile app saves a dislike and a pantry staple (the household's "Always have", ADR 034); a refresh here
    // shows them.
    await writeProfileSettings({ kitchen: { diets: ["vegan"], dislikes: ["Celery"] } });
    await setPantryStaples(["olive oil"]);
    await page.reload();
    await expect(main(page).getByRole("button", { name: "Remove Celery" })).toBeVisible();
    await expect(main(page).getByRole("switch", { name: "Share recipes I snap from public links in the Cooking Hub" })).toHaveAttribute("aria-checked", "false");
    // Staples live on the Pantry page since PIN-181, under "Always have".
    await page.goto("/app/settings/pantry");
    await expect(main(page).getByRole("region", { name: "Always have" }).getByRole("button", { name: "Remove olive oil" })).toBeVisible();
  });

  test("the first allergy asks for the notice before it is saved", async ({ page }) => {
    await resetTestUserSettings();
    await signIn(page);
    await page.goto("/app/settings/recipe");

    await main(page).getByRole("button", { name: "Peanuts" }).click();
    const notice = page.getByRole("dialog", { name: "Before you add an allergy" });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "Cancel" }).click();
    await expect(main(page).getByRole("button", { name: "Peanuts" })).toHaveAttribute("aria-pressed", "false");

    await main(page).getByRole("button", { name: "Peanuts" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "I understand" }).click();
    await expect(main(page).getByRole("button", { name: "Peanuts" })).toHaveAttribute("aria-pressed", "true");
    await expect(main(page).getByText(/Always check the ingredients and product labels yourself/)).toBeVisible();
    await expect.poll(async () => (await readProfileSettings()).kitchen?.allergies).toEqual(["peanuts"]);
    expect(typeof (await readProfileSettings()).kitchen?.allergyNoticeAcceptedAt).toBe("string");

    // Once accepted, the next one goes straight in.
    await main(page).getByRole("button", { name: "Sesame" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await readProfileSettings()).kitchen?.allergies).toEqual(["peanuts", "sesame"]);
  });

  test("Hebrew flips the layout at once, on the same page, with the choice still focused", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings/language");
    await expect(page.locator("#main h1")).toHaveText("Language & region");

    const hebrew = main(page).getByRole("radio", { name: "עברית" });
    await hebrew.click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page).toHaveURL(/\/app\/settings\/language$/);
    await expect(page.locator("#main h1")).toHaveText("שפה ואזור");
    await expect(hebrew).toBeFocused();
    await expect(hebrew).toHaveAttribute("aria-checked", "true");

    // The menu moved to the start side, which is now the right.
    const menuBox = await main(page).getByRole("navigation", { name: "הגדרות" }).boundingBox();
    const headingBox = await page.locator("#main h1").boundingBox();
    expect(menuBox!.x).toBeGreaterThan(headingBox!.x);

    // From the keyboard the arrows go the way they point: left is the next language in Hebrew (Russian), and once
    // the page is left to right again, right is the next one (Arabic).
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(main(page).getByRole("radio", { name: "العربية" })).toBeFocused();
    await main(page).getByRole("radio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("deleting the account asks first, then calls the delete function and signs out", async ({ page }) => {
    const email = uniqueEmail("e2e-delete");
    const password = "delete-me-123";
    await createUser(email, password);
    // The browser tests run local Supabase without the Edge Function runtime (CI excludes it), so the
    // delete-account function is stubbed: this checks the page's side. The function deletes for real in production.
    const deleteCalls: string[] = [];
    await page.route("**/functions/v1/delete-account", async (route) => {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      deleteCalls.push(route.request().method());
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await signIn(page, email, password);
    await page.goto("/app/settings/account");

    await main(page).getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account?" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();

    // Cancel keeps everything.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await canSignIn(email, password)).toBe(true);

    await main(page).getByRole("button", { name: "Delete account" }).click();
    await dialog.getByLabel(/type your email/).fill(email);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/app\/auth/);
    await expect(page.getByText("Your account and recipes are deleted. Thanks for cooking with Pinch.")).toBeVisible();
    expect(deleteCalls).toEqual(["POST"]);
  });

  test("signing out from Account goes to sign-in", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings/account");
    await main(page).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/app\/auth\?mode=signin/);
    expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.includes("auth-token")))).toBe(false);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the menu comes first, then the page, with a way back", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings");
    await expect(page.locator("#main h1")).toHaveText("Settings");
    await main(page).getByRole("link", { name: /Recipe preferences/ }).tap();
    await expect(page).toHaveURL(/\/app\/settings\/recipe$/);
    await expect(page.locator("#main h1")).toHaveText("Recipe preferences");
    await expect(main(page).getByRole("navigation", { name: "Settings" })).toHaveCount(0);

    await main(page).getByRole("link", { name: "Settings", exact: true }).tap();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await main(page).getByRole("link", { name: TEST_USER.email }).tap();
    await expect(page.locator("#main h1")).toHaveText("Account");
  });

  test("works in Hebrew, right to left", async ({ page }) => {
    const email = uniqueEmail("e2e-settings-he");
    await createUser(email, "shalom-pass-1", "he");
    await signIn(page, email, "shalom-pass-1");
    await page.goto("/app/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#main h1")).toHaveText("הגדרות");
    await main(page).getByRole("link", { name: /מראה/ }).tap();
    await expect(page).toHaveURL(/\/app\/settings\/appearance$/);
    await expect(page.locator("#main h1")).toHaveText("מראה");
  });
});

test.describe("tablet", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("uses the phone's menu-then-page flow, with room to spare", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings/support");
    await expect(page.locator("#main h1")).toHaveText("Help & support");
    await expect(main(page).getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Send message" })).toBeDisabled();
    await main(page).getByRole("textbox", { name: "What happened?" }).fill("The list forgets my last item.");
    await expect(main(page).getByRole("button", { name: "Send message" })).toBeEnabled();
  });
});

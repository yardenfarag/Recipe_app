import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { createMessage, deleteTestMessages, interactionEvents, receipt, testUserId } from "./activitySeed";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

// In-app messages on the new web app (PIN-143, ADR 023): one of each kind, written straight into local Supabase and
// aimed at the test account on the web only. Each is shown, recorded as seen once, and what the person did with it
// (dismissed, or which button) is recorded once. Pages a message opens in a new tab are answered locally.

test.use({ viewport: { width: 1280, height: 900 }, locale: "en-US" });

test.beforeEach(async () => {
  await deleteTestMessages();
  await resetLibrary([]);
});

test.afterEach(async () => {
  await deleteTestMessages();
  await resetTestUserLanguage();
});

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main")).toBeVisible();
}

/** New tabs to the web or the stores never leave this machine. */
async function answerOutsidePages(context: BrowserContext) {
  await context.route(/^https:\/\/(example\.com|apps\.apple\.com|play\.google\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Outside</title>" }),
  );
}

async function tapCount(since: string, name: string) {
  const userId = await testUserId();
  return (await interactionEvents({ since, userId })).filter((row) => row.kind === "tap" && row.name === name).length;
}

async function flushLog(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

test("an alert shows once, is seen once, and its Not now button records the dismissal", async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const id = await createMessage("alert", {
    presentation: "alert",
    content: { en: { title: "Meet the planner", body: "Plan your week.", primaryLabel: "Take a look", secondaryLabel: "Not now" } },
    primary_action: { type: "route", href: "/hub" },
    secondary_action: { type: "dismiss" },
  });
  await signIn(page);
  const dialog = page.getByRole("dialog", { name: "Meet the planner" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Take a look" })).toBeFocused();
  await expect.poll(async () => (await receipt(id))?.seen_count).toBe(1);

  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => Boolean((await receipt(id))?.dismissed_at)).toBe(true);

  // Shown once: not again after a reload, and seen still counted once.
  await page.reload();
  await expect(page.locator("#main")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await receipt(id))?.seen_count).toBe(1);

  await flushLog(page);
  await expect.poll(() => tapCount(since, "in_app_message.alert.secondary"), { timeout: 20_000 }).toBe(1);
});

test("a sheet's link opens in a new tab and is recorded as clicked; Escape closes the next one", async ({ page, context }) => {
  await answerOutsidePages(context);
  const id = await createMessage("sheet", {
    presentation: "sheet",
    tone: "success",
    content: { en: { title: "What is new", body: "Cook step by step.", primaryLabel: "Got it", linkLabel: "Release notes" } },
    primary_action: { type: "dismiss" },
    link_url: "https://example.com/release-notes",
  });
  await signIn(page);
  const sheet = page.getByRole("dialog", { name: "What is new" });
  await expect(sheet).toBeVisible();
  const popup = page.waitForEvent("popup");
  await sheet.getByRole("link", { name: /Release notes/ }).click();
  await (await popup).close();
  await expect(sheet).toHaveCount(0);
  await expect.poll(async () => (await receipt(id))?.clicked_button).toBe("link");
  expect((await receipt(id))?.seen_count).toBe(1);

  const second = await createMessage("sheet-escape", {
    presentation: "sheet",
    content: { en: { title: "Second sheet", body: "Close me." } },
  });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Second sheet" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Second sheet" })).toHaveCount(0);
  await expect.poll(async () => Boolean((await receipt(second))?.dismissed_at)).toBe(true);
});

test("a banner sits in the page, its button opens an app screen and is recorded once", async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const id = await createMessage("banner", {
    presentation: "banner",
    tone: "warning",
    content: { en: { title: "The Hub has new recipes", body: "Have a look.", primaryLabel: "Open the Hub" } },
    primary_action: { type: "route", href: "/(tabs)/hub" },
  });
  await signIn(page);
  const banner = page.getByRole("region", { name: "Message from Pinch" });
  await expect(banner).toContainText("The Hub has new recipes");
  // It doesn't cover the page or take focus.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await receipt(id))?.seen_count).toBe(1);

  await banner.getByRole("link", { name: "Open the Hub" }).click();
  await expect(page).toHaveURL(/\/app\/hub$/);
  await expect(banner).toHaveCount(0);
  await expect.poll(async () => (await receipt(id))?.clicked_button).toBe("primary");

  await flushLog(page);
  await expect.poll(() => tapCount(since, "in_app_message.banner.primary"), { timeout: 20_000 }).toBe(1);
});

test("a required update covers the app, can't be closed, and its Update button opens the store", async ({ page, context }) => {
  await answerOutsidePages(context);
  const id = await createMessage("required", {
    presentation: "fullscreen",
    tone: "critical",
    required: true,
    dismissible: false,
    content: { en: { title: "Please update Pinch", body: "This version is too old." } },
    // Every version of this app is below 999, so it matches until stopped.
    targeting: { maxAppVersion: "999" },
  });
  await signIn(page);
  const cover = page.getByRole("dialog", { name: "Please update Pinch" });
  await expect(cover).toBeVisible();
  await expect(cover.getByRole("button", { name: "Close" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cover).toBeVisible();
  // Focus stays inside it.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(await cover.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  const popup = page.waitForEvent("popup");
  await cover.getByRole("button", { name: "Update" }).click();
  expect((await popup).url()).toMatch(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//);
  // Still there: it goes only when the targeting stops matching.
  await expect(cover).toBeVisible();
  await expect.poll(async () => (await receipt(id))?.clicked_button).toBe("primary");
  expect((await receipt(id))?.dismissed_at).toBeNull();
});

test("a message aimed at other platforms or a newer version never shows on the new web app", async ({ page }) => {
  await createMessage("ios-only", {
    presentation: "alert",
    content: { en: { title: "Phones only", body: "" } },
    targeting: { platforms: ["ios", "android"] },
  });
  await createMessage("newer-only", {
    presentation: "alert",
    content: { en: { title: "Newer only", body: "" } },
    targeting: { minAppVersion: "999" },
  });
  await signIn(page);
  await page.waitForTimeout(2000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

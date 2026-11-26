import { expect, test, type Page } from "@playwright/test";

import { createUser, uniqueEmail } from "./admin";
import { accountMenuButton, signInWithPassword } from "./helpers";

// Food avatars: pick a food friend as the profile picture in Settings → Account. It's saved on the account
// (`avatar_url` = "food:<id>", which the mobile app reads too) and shows in the account menu on every page.
// SCREENSHOTS=<folder> also saves the picker on a phone and a desktop, in English and Hebrew, light and dark.

const PASSWORD = "avatar-test-password-1";
const OUT = process.env.SCREENSHOTS;

async function signInAsNewCook(page: Page, locale = "en") {
  const email = uniqueEmail("avatar");
  await createUser(email, PASSWORD, locale);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, email, PASSWORD);
  await expect(page.locator("#main h1:visible")).toBeVisible();
  return email;
}

/** The account menu button's picture: a drawing (data: URI), or no image at all for the email's first letter. */
function menuAvatar(page: Page) {
  return accountMenuButton(page).locator("img");
}

test.describe("food avatars", () => {
  test.use({ locale: "en-US", viewport: { width: 1280, height: 900 } });

  test("a cook picks a food friend, and it shows in Settings and the account menu, and after a reload", async ({ page }) => {
    await signInAsNewCook(page);
    await expect(menuAvatar(page)).toHaveCount(0);

    await page.goto("/app/settings/account");
    await page.getByRole("button", { name: "Change profile picture" }).click();
    const dialog = page.getByRole("dialog", { name: "Change profile picture" });
    const friends = dialog.getByRole("list", { name: "Pick a food friend" }).getByRole("button");
    await expect(friends).toHaveCount(12);
    await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Smart pizza" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(menuAvatar(page)).toHaveAttribute("src", /^data:image\/svg\+xml/);

    await page.reload();
    await expect(menuAvatar(page)).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await page.getByRole("button", { name: "Change profile picture" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Smart pizza", pressed: true })).toBeVisible();

    // Changing again works the same way.
    await page.getByRole("dialog").getByRole("button", { name: "Sunny egg" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Change profile picture" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Sunny egg", pressed: true })).toBeVisible();
  });
});

test.describe("food avatar screenshots", () => {
  test.skip(!OUT, "Set SCREENSHOTS=<folder> to take screenshots.");

  for (const [device, viewport] of [
    ["phone", { width: 360, height: 780 }],
    ["desktop", { width: 1440, height: 900 }],
  ] as const) {
    for (const lang of ["en", "he"] as const) {
      for (const scheme of ["light", "dark"] as const) {
        test(`${device} ${lang} ${scheme}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme: scheme });
          await signInAsNewCook(page, lang);
          await page.goto("/app/settings/account");
          await page.locator("#main button[data-track='settings.avatar.change']").click();
          const dialog = page.getByRole("dialog");
          await dialog.locator("button[data-track='settings.avatar.food.donut']").click();
          await expect(dialog).toHaveCount(0);
          await page.screenshot({ path: `${OUT}/avatars-account-${device}-${lang}-${scheme}.png` });
          await page.locator("#main button[data-track='settings.avatar.change']").click();
          await expect(dialog.locator("button[aria-pressed='true']")).toHaveCount(1);
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${OUT}/avatars-picker-${device}-${lang}-${scheme}.png` });
        });
      }
    }
  }
});

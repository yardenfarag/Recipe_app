import { expect, test, type Page } from "@playwright/test";

import { createCreditsUser, FAKE_POLAR_CHECKOUT, grantPolarPurchase, purchasedCredits, stubCheckout, type CreditsUser } from "./creditsSeed";
import { accountMenuButton, signInWithPassword } from "./helpers";

// Credits and buying packs through Polar (PIN-141). No real payment ever happens here: polar-checkout is a stub,
// Polar's page is a stand-in (creditsSeed.ts), and a paid order is written the way polar-webhook writes it.
//
// The buying tests need a build with web sales on: e2e/serve.mjs must build with
// NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED=true. That is safe here: every Edge Function is stubbed and the database is
// local. The build-time "off" switch is covered by unit tests (components/credits/*.test.tsx).

test.use({ viewport: { width: 1280, height: 900 }, locale: "en-US" });

const CREDITS_PATH = "/app/settings/credits";

async function signInTo(page: Page, user: CreditsUser, path = CREDITS_PATH) {
  await page.goto(`/app/auth?mode=signin&next=${encodeURIComponent(path.replace(/^\/app/, ""))}`);
  await signInWithPassword(page, user.email, user.password);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

const balance = (page: Page) => page.getByRole("region", { name: "Credits available" });
/** The big total at the top of the balance card (the breakdown under it repeats the number). */
const balanceTotal = (page: Page, total: string) => balance(page).locator("p[aria-live]").filter({ hasText: new RegExp(`^${total}$`) });
const buyButton = (page: Page, credits: number) => page.getByRole("button", { name: new RegExp(`^Buy ${credits} recipe credits for `) });
const returnDialog = (page: Page) => page.getByRole("dialog", { name: "Payment received" });

async function menuCredits(page: Page) {
  await accountMenuButton(page).click();
  const item = page.getByRole("menuitem", { name: /Recipe credits/ });
  const text = (await item.textContent()) ?? "";
  await page.keyboard.press("Escape");
  return text;
}

test("the credits page shows the balance, where it comes from, the packs and what each action costs", async ({ page }) => {
  const user = await createCreditsUser({ purchased: 16, freeUsed: 3 });
  await stubCheckout(page);
  await signInTo(page, user);

  await expect(page.locator("#main h1")).toHaveText("Credits");
  await expect(page).toHaveTitle("Credits · Pinch");
  await expect(balanceTotal(page, "23")).toBeVisible();
  await expect(balance(page).getByText("7 of 10 left")).toBeVisible();
  await expect(balance(page).getByText(/^Back to 10 on /)).toBeVisible();
  await expect(balance(page).locator("dl").getByText("16", { exact: true })).toBeVisible();

  await expect(buyButton(page, 10)).toHaveAccessibleName("Buy 10 recipe credits for $1.99");
  await expect(buyButton(page, 30)).toHaveAccessibleName("Buy 30 recipe credits for $4.99");
  await expect(buyButton(page, 100)).toHaveAccessibleName("Buy 100 recipe credits for $7.99");
  await expect(page.getByText("Best value")).toBeVisible();

  const costs = page.getByRole("region", { name: "What uses credits" });
  await expect(costs.getByText("1 credit")).toHaveCount(3);
  await expect(costs.getByText("Translating a recipe")).toBeVisible();

  // The account menu, on every page, has the balance and a way here.
  expect(await menuCredits(page)).toContain("23");
});

test("buying a pack opens Polar's checkout, and coming back shows the payment and the new balance everywhere", async ({ page }) => {
  const user = await createCreditsUser({ freeUsed: 10 });
  const calls = await stubCheckout(page);
  await signInTo(page, user);
  await expect(balanceTotal(page, "0")).toBeVisible();

  await buyButton(page, 30).click();
  await expect(page).toHaveURL(FAKE_POLAR_CHECKOUT);
  expect(calls).toEqual([{ pack_id: "pinch_credits_30", return_url: `http://localhost:3100${CREDITS_PATH}` }]);

  // Polar takes the payment and the webhook adds the pack; Polar sends the buyer back with the checkout id.
  await grantPolarPurchase(user.id, 30);
  await page.goto(`${CREDITS_PATH}?checkout_id=chk_e2e_paid`);
  await expect(returnDialog(page)).toBeVisible();
  await expect(returnDialog(page).getByText("30 credits were added to your account.")).toBeVisible();
  await expect(returnDialog(page).getByText("30 credits available")).toBeVisible();
  // The address loses the checkout id, so a reload doesn't announce it again.
  await expect(page).toHaveURL(new RegExp(`${CREDITS_PATH}$`));

  await returnDialog(page).getByRole("button", { name: "Great" }).click();
  await expect(returnDialog(page)).toHaveCount(0);
  await expect(balanceTotal(page, "30")).toBeVisible();
  expect(await menuCredits(page)).toContain("30");

  await page.reload();
  await expect(balanceTotal(page, "30")).toBeVisible();
  await expect(returnDialog(page)).toHaveCount(0);

  // The credits are on the account, which is what the mobile app reads.
  expect(await purchasedCredits(user.id)).toBe(30);
});

test("coming back before the webhook lands waits for it, even across a reload, and comes back to the page it started from", async ({ page }) => {
  const user = await createCreditsUser({ freeUsed: 10 });
  await stubCheckout(page);
  await signInTo(page, user, "/app/add");

  // Returned to Snap, where the out-of-credits prompt was. The webhook hasn't arrived yet.
  await page.goto("/app/add?checkout_id=chk_e2e_slow");
  await expect(returnDialog(page).getByText("Thanks! Adding your credits…")).toBeVisible();

  await page.reload();
  await expect(returnDialog(page).getByText("Thanks! Adding your credits…")).toBeVisible();

  await grantPolarPurchase(user.id, 100);
  await expect(returnDialog(page).getByText("100 credits were added to your account.")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/app\/add$/);
  await returnDialog(page).getByRole("button", { name: "Great" }).click();
  expect(await menuCredits(page)).toContain("100");
});

test("closing the dialog while waiting still says when the credits arrive", async ({ page }) => {
  const user = await createCreditsUser({ freeUsed: 10 });
  await stubCheckout(page);
  await signInTo(page, user);

  await page.goto(`${CREDITS_PATH}?checkout_id=chk_e2e_closed`);
  await expect(returnDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(returnDialog(page)).toHaveCount(0);

  await grantPolarPurchase(user.id, 10);
  await expect(page.getByText("10 credits were added to your account.")).toBeVisible({ timeout: 15_000 });
  await expect(balanceTotal(page, "10")).toBeVisible();
  await expect(returnDialog(page)).toHaveCount(0);
});

test("a cancelled checkout comes back cleanly: no charge, no message, ready to buy again", async ({ page }) => {
  const user = await createCreditsUser({ purchased: 4, freeUsed: 10 });
  await stubCheckout(page);
  await signInTo(page, user);

  await buyButton(page, 10).click();
  await expect(page).toHaveURL(FAKE_POLAR_CHECKOUT);
  // The buyer changes their mind on Polar's page and goes back.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${CREDITS_PATH}$`));
  await expect(balanceTotal(page, "4")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main").getByRole("alert")).toHaveCount(0);
  await expect(buyButton(page, 10)).toBeEnabled();
  expect(await purchasedCredits(user.id)).toBe(4);
});

test("with web sales switched off on the server, buying says to use the app instead of failing", async ({ page }) => {
  const user = await createCreditsUser();
  const calls = await stubCheckout(page, { status: 503, body: { error: "purchases_disabled" } });
  await signInTo(page, user);

  await buyButton(page, 30).click();
  await expect(page.getByText("Buy credits in the Pinch app")).toBeVisible();
  await expect(page.getByRole("link", { name: /App Store/ })).toHaveAttribute("href", /apps\.apple\.com/);
  await expect(page.getByRole("link", { name: /Google Play/ })).toHaveAttribute("href", /play\.google\.com/);
  await expect(buyButton(page, 30)).toHaveCount(0);
  await expect(page.locator("#main").getByRole("alert")).toHaveCount(0);
  expect(calls).toHaveLength(1);
});

test("a checkout that can't open says so and lets them try again", async ({ page }) => {
  const user = await createCreditsUser();
  await stubCheckout(page, { status: 502, body: { error: "Checkout unavailable" } });
  await signInTo(page, user);

  await buyButton(page, 10).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("The purchase didn’t complete. Try again.");
  await expect(buyButton(page, 10)).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`${CREDITS_PATH}$`));
});

test.describe("Hebrew, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the page reads right to left and the packs stack", async ({ page }) => {
    // The account's saved language wins once signed in.
    const user = await createCreditsUser({ purchased: 2, locale: "he" });
    await stubCheckout(page);
    await signInTo(page, user);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const buttons = page.getByRole("button", { name: /^לקנות / });
    await expect(buttons).toHaveCount(3);
    const first = await buttons.nth(0).boundingBox();
    const second = await buttons.nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y);
  });
});

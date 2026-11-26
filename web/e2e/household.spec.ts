import { expect, test, type Browser, type Page } from "@playwright/test";

import { signInWithPassword } from "./helpers";
import { householdOf, membersOf, newAccount, type Account } from "./householdSeed";

/**
 * Households (ADR 034) end to end: set one up, invite with the link, a second account joins in another browser,
 * the list is shared live with "Added by", and leaving and removing work. Fresh accounts every run.
 */

test.use({ viewport: { width: 1280, height: 900 }, locale: "en-US" });

async function signedIn(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, account.email, account.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
  return page;
}

const main = (page: Page) => page.locator("#main");
const item = (page: Page, name: string) => page.getByRole("checkbox", { name: new RegExp(`^${name}(,|$)`) });

test("set up a household, invite by link, share the list live, then leave", async ({ browser }) => {
  test.setTimeout(120_000);
  const ada = await newAccount("e2e-household-ada");
  const ben = await newAccount("e2e-household-ben");

  // Ada finds Household in Settings, marked New until she opens it.
  const adaPage = await signedIn(browser, ada);
  await adaPage.goto("/app/settings");
  const row = adaPage.getByRole("link", { name: /Household/ }).first();
  await expect(row).toContainText("New");
  await row.click();
  await expect(main(adaPage).getByRole("heading", { name: "Set up your household" })).toBeVisible();
  await expect(row).not.toContainText("New");

  // Setting it up checks the name first.
  await main(adaPage).getByRole("button", { name: "Create household" }).click();
  await expect(main(adaPage).getByText("Give your household a name.")).toBeVisible();
  await main(adaPage).getByLabel("Household name").fill("Test Home");
  await main(adaPage).getByRole("radio", { name: "Honey jar" }).click();
  await main(adaPage).getByLabel("Your name").fill("Ada");
  await main(adaPage).getByRole("button", { name: "Create household" }).click();

  // Straight on to inviting.
  const invite = adaPage.getByRole("dialog", { name: "Invite the people you live with" });
  await expect(invite.getByRole("link", { name: "Send on WhatsApp" })).toBeVisible();
  const link = await invite.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/app\/join\/[A-Za-z0-9_-]{16,}$/);
  await invite.getByRole("button", { name: "Later" }).click();
  await expect(main(adaPage).getByText("Only you so far")).toBeVisible();

  // Ben opens the link signed out: he sees whose it is, and signs in to join.
  const guest = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, locale: "en-US" });
  const benPage = await guest.newPage();
  await benPage.goto(new URL(link).pathname);
  await expect(benPage.getByRole("heading", { level: 1, name: "Join Test Home?" })).toBeVisible();
  await expect(benPage.getByText("Ada invited you")).toBeVisible();
  await benPage.getByRole("link", { name: "I have an account" }).click();
  await signInWithPassword(benPage, ben.email, ben.password);
  // Back on the invite, joining carries on by itself and opens the list.
  await expect(benPage).toHaveURL(/\/app\/list/);
  await expect(benPage.getByText("You're in Test Home")).toBeVisible();
  await expect.poll(() => membersOf(ada)).toHaveLength(2);

  // Ada's list says who shares it; what she adds shows on Ben's, live, with her name.
  await adaPage.goto("/app/list");
  await expect(main(adaPage).getByText(/^Shared with /)).toBeVisible();
  await adaPage.getByRole("textbox", { name: "Item name" }).fill("oat milk");
  await adaPage.keyboard.press("Enter");
  await expect(item(adaPage, "oat milk")).toBeVisible();
  await expect(item(benPage, "oat milk")).toBeVisible({ timeout: 15_000 });
  await expect(item(benPage, "oat milk")).toHaveAccessibleName(/Added by Ada/);
  // And not on her own.
  await expect(item(adaPage, "oat milk")).not.toHaveAccessibleName(/Added by/);

  // Ben leaves, taking a copy.
  await benPage.goto("/app/settings/household");
  await benPage.getByRole("button", { name: "Leave household" }).click();
  await benPage.getByRole("dialog", { name: "Leave Test Home?" }).getByRole("button", { name: "Leave" }).click();
  await expect(benPage.getByText("You left Test Home")).toBeVisible();
  await expect.poll(() => membersOf(ada)).toEqual(["Ada"]);
  await benPage.goto("/app/list");
  await expect(item(benPage, "oat milk")).toBeVisible();

  await guest.close();
  await adaPage.context().close();
});

test("anyone in the household can remove someone", async ({ browser }) => {
  const dana = await newAccount("e2e-household-dana");
  const eli = await newAccount("e2e-household-eli");
  await householdOf("The Cohens", [
    { account: dana, displayName: "Dana" },
    { account: eli, displayName: "Eli" },
  ]);

  const page = await signedIn(browser, eli);
  await page.goto("/app/settings/household");
  await expect(main(page).getByRole("heading", { name: "The Cohens" })).toBeVisible();
  await main(page).getByRole("button", { name: "Remove Dana from the household" }).click();
  await page.getByRole("dialog", { name: "Remove Dana?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Dana was removed")).toBeVisible();
  await expect(main(page).getByText("Only you so far")).toBeVisible();
  // Dana has a household of her own now (not set up, so the name she had in this one doesn't carry over).
  await expect.poll(async () => (await membersOf(dana)).length).toBe(1);
  await page.context().close();
});

test("an invite that doesn't work says so", async ({ page }) => {
  await page.goto("/app/join/this-is-not-a-real-invite-token");
  await expect(page.getByRole("heading", { level: 1, name: "This invite doesn't work" })).toBeVisible();
});

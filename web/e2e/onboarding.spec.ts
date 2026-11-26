import { expect, test, type Page } from "@playwright/test";

import { createUser, uniqueEmail } from "./admin";
import { signInWithPassword, signOutFromMenu } from "./helpers";
import { resetHub } from "./hubSeed";
import { markOnboardedElsewhere, readOnboardingAccount } from "./onboardingSeed";
import { importedRecipe, stubImports } from "./snapSeed";

// First visit (PIN-140): the welcome page, sign-up, the first-run questions, and the pointer to a first recipe.
// Imports are stubbed (snapSeed.ts): a real one spends credits and calls paid models.

const PASSWORD = "first-visit-123";

test.use({ locale: "en-US" });

async function signUp(page: Page, email: string) {
  // By field name, not label: the same helper serves the Hebrew run.
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a new visitor goes from the front door to a saved first recipe", async ({ page }) => {
    // The Hub recipes the first-recipes picker chooses from: one fits the answers below, one has peanuts in it.
    await resetHub([
      { name: "Peanut Noodles", diets: ["vegetarian"], ingredients: ["peanuts", "noodles"], save_count: 30 },
      { name: "Veggie Lasagna", diets: ["vegetarian"], save_count: 20 },
      { name: "Beef Stew", save_count: 10 },
    ]);
    await stubImports(page, {
      "extract-recipe": { body: { status: "full", platform: "web", recipe: importedRecipe("First Visit Pasta", { platform: "web" }) } },
    });
    const email = uniqueEmail("e2e-first-visit");

    // The landing page's "Continue on the web" opens /app/: someone new sees the welcome page, not sign-in.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome$/);
    await expect(page.getByRole("heading", { level: 1, name: "Save any recipe in seconds. Cook it tonight." })).toBeVisible();
    await expect(page).toHaveTitle("Welcome · Pinch");

    await page.getByRole("link", { name: "Get started free" }).click();
    await expect(page).toHaveURL(/\/app\/auth\?mode=signup&reason=welcome&next=%2Fonboarding$/);
    await expect(page.getByText("Create your free account. Then three quick questions")).toBeVisible();
    await signUp(page, email);

    // Question 1: diets. Wide screen: the questions are listed beside the current one.
    await expect(page).toHaveURL(/\/app\/onboarding$/);
    await expect(page.locator("#main h1:visible")).toHaveText("How do you usually cook?");
    await expect(page).toHaveTitle("Set up your kitchen · Pinch");
    await expect(page.getByRole("list", { name: "Set up your kitchen" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    const vegetarian = page.getByRole("button", { name: /^Vegetarian/ });
    await vegetarian.click();
    await expect(vegetarian).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Continue" }).click();

    // Question 2: allergies and dislikes, with the same allergy notice as Settings.
    await expect(page).toHaveURL(/\/app\/onboarding\?step=avoid$/);
    await expect(page.locator("#main h1:visible")).toHaveText("Any allergies, or foods you don’t like?");
    await expect(page.locator("#main h1:visible")).toBeFocused();
    await page.getByRole("button", { name: "Peanuts" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "I understand" }).click();
    await expect(page.getByRole("button", { name: "Peanuts" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("switch", { name: "Always adapt new recipes for me" })).toBeVisible();

    // The browser's Back goes to the previous question, with the answer kept.
    await page.goBack();
    await expect(page.locator("#main h1:visible")).toHaveText("How do you usually cook?");
    await expect(vegetarian).toHaveAttribute("aria-pressed", "true");
    await page.goForward();
    await expect(page.locator("#main h1:visible")).toHaveText("Any allergies, or foods you don’t like?");
    await page.getByRole("button", { name: "Continue" }).click();

    // Question 3: one press answers and finishes.
    await expect(page.locator("#main h1:visible")).toHaveText("How did you hear about Pinch?");
    await page.getByRole("button", { name: "A friend or family member" }).click();

    // The offer to fill the pantry from photos (PIN-181); Later goes on.
    await expect(page.getByRole("dialog", { name: "Fill your pantry in two minutes?" })).toBeVisible();
    await page.getByRole("button", { name: "Later" }).click();

    // Then the first recipes, from the Hub: fitting the diet first, never anything on the avoid list, at least one.
    await expect(page).toHaveURL(/\/app\/first-recipes$/);
    await expect(page.locator("#main h1:visible")).toHaveText("Pick your first recipes");
    await expect(page.getByText("Picked for your diet, with nothing on your avoid list.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pick at least one" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Peanut Noodles/ })).toHaveCount(0);
    const lasagna = page.getByRole("button", { name: /Veggie Lasagna/ });
    await expect(lasagna).toContainText("Fits your diet");
    await lasagna.click();
    await expect(lasagna).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Save 1 recipe" }).click();

    // The Library starts with it.
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.getByRole("link", { name: "E2E Hub Veggie Lasagna" })).toBeVisible();

    // The answers are on the account, where the mobile app and Settings read them.
    await expect
      .poll(async () => {
        const account = await readOnboardingAccount(email, PASSWORD);
        return {
          onboarded: typeof account.metadata.onboarded_at === "string",
          diets: account.kitchen?.diets,
          allergies: account.kitchen?.allergies,
          notice: typeof account.kitchen?.allergyNoticeAcceptedAt === "string",
        };
      })
      .toEqual({ onboarded: true, diets: ["vegetarian"], allergies: ["peanuts"], notice: true });

    // And a Snap of their own, saved as it comes in.
    await page.goto("/app/add");
    await page.getByLabel("Recipe URL").fill("https://www.example-recipes.com/first-visit-pasta");
    await page.getByRole("button", { name: "Snap", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}\?justSaved=1$/);
    await expect(page.locator("#main h1:visible")).toHaveText("First Visit Pasta");
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "First Visit Pasta" })).toBeVisible();
    await resetHub([]);
  });

  test("someone who finished onboarding on the phone isn't asked again", async ({ page }) => {
    const email = uniqueEmail("e2e-onboarded");
    await createUser(email, PASSWORD);
    await markOnboardedElsewhere(email, PASSWORD);

    // New to this browser, so the welcome page; "Get started" by mistake, then "I have an account".
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome$/);
    await page.getByRole("link", { name: "Get started free" }).click();
    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
    await signInWithPassword(page, email, PASSWORD);

    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.locator("#main h1:visible")).toHaveText("Your recipes");
    await page.goto("/app/list");
    await expect(page).toHaveURL(/\/app\/list$/);

    // Signed out, this browser now goes to sign-in, not the welcome page.
    await signOutFromMenu(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/auth\?mode=signin$/);
  });

  test("leaving the questions halfway brings a new account back to finish them", async ({ page }) => {
    const email = uniqueEmail("e2e-halfway");
    await page.goto("/app/welcome");
    await page.getByRole("link", { name: "Get started free" }).click();
    await signUp(page, email);
    await expect(page.locator("#main h1:visible")).toHaveText("How do you usually cook?");

    await page.goto("/app/list");
    await expect(page).toHaveURL(/\/app\/onboarding\?next=%2Flist$/);
    await expect(page.locator("#main h1:visible")).toHaveText("How do you usually cook?");

    // Skip for now ends it (and goes where they were headed); it doesn't come back.
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/app\/list$/);
    await page.goto("/app");
    await expect(page.locator("#main h1:visible")).toHaveText("Your recipes");
    await expect.poll(async () => typeof (await readOnboardingAccount(email, PASSWORD)).metadata.onboarded_at).toBe("string");
  });

  test("a guest opening a Hub recipe sees the recipe, not the welcome page", async ({ page }) => {
    const [card] = await resetHub([{ name: "First Visit Soup" }]);
    await page.goto(`/app/hub/${card.id}`);
    await expect(page.locator("#main h1:visible")).toHaveText(card.title);
    await expect(page).toHaveURL(new RegExp(`/app/hub/${card.id}$`));
    // Left behind, the card would put the first-recipes picker (#104) in front of the next test's new account.
    await resetHub([]);
  });
});

test.describe("phone, in Hebrew", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the language picked on the way in carries through sign-up, the questions and the first recipes", async ({ page }) => {
    await resetHub([{ name: "Hummus Bowl", save_count: 10 }]);
    const email = uniqueEmail("e2e-first-visit-he");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome$/);
    await page.getByRole("button", { name: "עברית" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("שומרים כל מתכון בשניות. מבשלים אותו הערב.");
    // Nothing reaches past the side of a phone (the illustration's glow and badge used to).
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByRole("link", { name: "מתחילים בחינם" }).click();
    await signUp(page, email);

    // A phone gets a progress bar instead of the list beside the question, and the way on stays in reach.
    await expect(page).toHaveURL(/\/app\/onboarding$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("שלב 1 מתוך 3")).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
    await page.getByRole("button", { name: "דלגו בינתיים" }).click();
    await page.getByRole("button", { name: "אחר כך" }).click();

    // Skipping the questions still leads to the first recipes, in Hebrew, fitting a phone.
    await expect(page).toHaveURL(/\/app\/first-recipes$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#main h1:visible")).toHaveText("בחרו את המתכונים הראשונים שלכם");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Hummus Bowl/ }).click();
    await page.getByRole("button", { name: "שמירת 1 מתכון" }).click();
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.getByRole("link", { name: "E2E Hub Hummus Bowl" })).toBeVisible();
    await resetHub([]);
    await expect
      .poll(async () => {
        const account = await readOnboardingAccount(email, PASSWORD);
        return { locale: account.metadata.locale, onboarded: typeof account.metadata.onboarded_at === "string" };
      })
      .toEqual({ locale: "he", onboarded: true });
  });
});

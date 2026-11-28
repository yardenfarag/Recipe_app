import { test, type Browser, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { writeAccountPrefs } from "./prefsSeed";
import { repairHandler, stubFunctions } from "./recipeActionsSeed";
import { resetTestUserSettings, writeProfileSettings } from "./settingsSeed";
import { importedRecipe, SOURCE_LINKS, stubImports } from "./snapSeed";
import { TEST_USER } from "./testUser";

/**
 * Screenshots of the popups, notices and toasts for a UX review: dialogs that ask before something costly, the notices
 * on a recipe, and failure messages. Phone and desktop, English light and Hebrew dark. Triggers are found by their
 * activity-log ids (data-track), so the same steps work in both languages.
 * Only when asked: SCREENSHOTS=<folder> npm run test:e2e -- screenshots-popups
 */
const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, "Set SCREENSHOTS=<folder> to take screenshots.");

const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } } as const;
type Viewport = keyof typeof VIEWPORTS;
type Prefs = { language: "en" | "he"; scheme: "light" | "dark" };
const COMBOS: [Viewport, Prefs][] = [
  ["phone", { language: "en", scheme: "light" }],
  ["phone", { language: "he", scheme: "dark" }],
  ["desktop", { language: "en", scheme: "light" }],
  ["desktop", { language: "he", scheme: "dark" }],
];
const name = (shot: string, viewport: Viewport, prefs: Prefs) => `${OUT}/popup-${shot}-${viewport}-${prefs.language}-${prefs.scheme}.png`;

let storageState: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await page.locator("#main").waitFor();
  storageState = await context.storageState();
  await context.close();
});

test.afterAll(async () => {
  await resetTestUserLanguage();
  await resetTestUserSettings();
  await resetLibrary([]);
});

async function open(browser: Browser, viewport: Viewport, prefs: Prefs, before?: (page: Page) => Promise<unknown>) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: viewport === "desktop" ? 1 : 2,
    storageState,
    colorScheme: prefs.scheme,
  });
  await context.addInitScript((p: Prefs) => {
    localStorage.setItem("pinch:appLanguage", p.language);
    localStorage.setItem("pinch.themePreference", p.scheme);
    localStorage.setItem("pinch.themePack", "mist");
  }, prefs);
  await writeAccountPrefs({ locale: prefs.language, prefs: { scheme: prefs.scheme, pack: "mist", measurement: "original" } });
  const page = await context.newPage();
  if (before) await before(page);
  return { page, context };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await page.locator("#main h1:visible").first().waitFor();
  await page.waitForTimeout(400);
}

const click = (page: Page, track: string) => page.locator(`[data-track="${track}"]`).filter({ visible: true }).first().click();
const dialogShown = async (page: Page) => {
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
};

/** Has a peanut allergy and a cilantro dislike, with the allergy notice already accepted. */
const KITCHEN = { allergies: ["peanuts"], dislikes: ["Cilantro"], allergyNoticeAcceptedAt: new Date().toISOString() };

const SATAY: SeedRecipe = {
  title: "Satay noodles",
  servings: 2,
  estimated_time_minutes: 20,
  effort_level: "Easy",
  extraction_status: "partial",
  original_url: "https://example.com/satay-noodles",
  ingredients: [
    { name: "rice noodles", quantity: 200, unit: "g" },
    { name: "peanut butter", quantity: 3, unit: "tbsp" },
    { name: "cilantro", quantity: 1, unit: "handful" },
    { name: "lime", quantity: 1, unit: "" },
  ],
  instructions: [{ step: 1, text: "Whisk the peanut butter with lime juice and a splash of hot water." }],
};

const SALAD: SeedRecipe = {
  title: "Green salad",
  servings: 2,
  estimated_time_minutes: 10,
  effort_level: "Easy",
  original_url: "https://example.com/green-salad",
  ingredients: [
    { name: "lettuce", quantity: 1, unit: "head" },
    { name: "cucumber", quantity: 1, unit: "" },
    { name: "olive oil", quantity: 2, unit: "tbsp" },
  ],
  instructions: [
    { step: 1, text: "Tear the lettuce and slice the cucumber." },
    { step: 2, text: "Dress with olive oil and salt." },
  ],
};

test("recipe notices, auto-saved strip, remove and repair dialogs, error toast", async ({ browser }) => {
  test.setTimeout(600_000);
  await writeProfileSettings({ kitchen: KITCHEN });
  const [satay, salad] = await resetLibrary([
    { ...SATAY, createdSecondsAgo: 1 },
    { ...SALAD, createdSecondsAgo: 2 },
  ]);
  for (const [viewport, prefs] of COMBOS) {
    // The notices (allergy, dislike, missing details) and the "Saved to your Library" strip.
    {
      const { page, context } = await open(browser, viewport, prefs, (p) =>
        stubFunctions(p, { "repair-recipe": repairHandler({ ...SATAY, extraction_status: "full" }, "Added the missing steps: cook the noodles, then toss them in the sauce.") }),
      );
      await go(page, `/app/recipe/${satay}?justSaved=1`);
      // The Snap reveal (PIN-192) plays first; the strip comes in once the card has landed.
      await page.locator('[data-track="recipe.auto_saved.remove"]').filter({ visible: true }).first().waitFor();
      await page.screenshot({ path: name("recipe-notices", viewport, prefs), fullPage: true });

      await click(page, "recipe.auto_saved.remove");
      await dialogShown(page);
      await page.screenshot({ path: name("auto-saved-remove", viewport, prefs) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      await click(page, "recipe.repair");
      await page.getByRole("dialog").getByRole("button").last().waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: name("repair", viewport, prefs) });
      await context.close();
    }
    // A clean recipe for a cook with allergies set: the "nothing to fix" tile.
    {
      const { page, context } = await open(browser, viewport, prefs);
      await go(page, `/app/recipe/${salad}`);
      await page.screenshot({ path: name("recipe-clean", viewport, prefs), fullPage: true });
      // Saving fails: the error toast.
      await page.route("**/rest/v1/**", (route) => (route.request().method() === "GET" ? route.fallback() : route.fulfill({ status: 500, body: "{}" })));
      await click(page, "recipe.favorite");
      await page.waitForTimeout(700);
      await page.screenshot({ path: name("toast-error", viewport, prefs) });
      await context.close();
    }
  }
});

test("snap: guess the recipe, out of credits, a failure", async ({ browser }) => {
  test.setTimeout(600_000);
  await resetLibrary([]);
  const link = SOURCE_LINKS[2].url;
  const snap = async (page: Page) => {
    await page.locator('#main input[type="url"]').fill(link);
    await page.locator('#main input[type="url"]').press("Enter");
  };
  for (const [viewport, prefs] of COMBOS) {
    const { page, context } = await open(browser, viewport, prefs, (p) =>
      stubImports(p, {
        "extract-recipe": [
          { body: { status: "failed", platform: "tiktok", code: "looks_like_dish", dish_guess: "pad thai" } },
          { status: 402, body: { status: "failed", platform: "web", code: "insufficient_credits", message: "No credits" } },
          { body: { status: "failed", platform: "web", code: "not_food" } },
        ],
        "invent-recipe": { body: { status: "full", platform: "tiktok", recipe: importedRecipe("Pad Thai", { extraction_source: "invented" }) } },
      }),
    );
    await go(page, "/app/add");
    await snap(page);
    await dialogShown(page);
    await page.screenshot({ path: name("snap-guess", viewport, prefs) });
    await page.keyboard.press("Escape");

    await snap(page);
    await page.locator('[data-track="snap.credits.buy"]').filter({ visible: true }).first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: name("snap-credits-banner", viewport, prefs) });
    await click(page, "snap.credits.buy");
    await dialogShown(page);
    await page.screenshot({ path: name("out-of-credits", viewport, prefs) });
    await page.keyboard.press("Escape");

    await snap(page);
    await page.getByRole("alert").first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: name("snap-failed", viewport, prefs) });
    await context.close();
  }
});

test("settings: delete account and the allergy notice", async ({ browser }) => {
  test.setTimeout(600_000);
  for (const [viewport, prefs] of COMBOS) {
    const { page, context } = await open(browser, viewport, prefs);
    await go(page, "/app/settings/account");
    await click(page, "settings.delete_account");
    await dialogShown(page);
    await page.screenshot({ path: name("delete-account", viewport, prefs) });
    await context.close();

    await resetTestUserSettings();
    const second = await open(browser, viewport, prefs);
    await go(second.page, "/app/settings/recipe");
    await second.page.locator('[data-track$=".allergy.toggle"]').filter({ visible: true }).first().click();
    await dialogShown(second.page);
    await second.page.screenshot({ path: name("allergy-notice", viewport, prefs) });
    await second.context.close();
  }
});

test("a page that couldn't load", async ({ browser }) => {
  for (const [viewport, prefs] of COMBOS) {
    const { page, context } = await open(browser, viewport, prefs, (p) =>
      p.route("**/rest/v1/recipes**", (route) => route.fulfill({ status: 500, body: "{}" })),
    );
    await page.goto("/app");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: name("library-error", viewport, prefs) });
    await context.close();
  }
});

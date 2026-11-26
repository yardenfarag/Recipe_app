import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { resetHub } from "./hubSeed";
import { resetShoppingList } from "./listSeed";
import { writeAccountPrefs } from "./prefsSeed";
import { resetShares, stubRecipeShare } from "./shareSeed";
import { TEST_USER } from "./testUser";

/**
 * Every page at phone, tablet and desktop width, in all five languages (PIN-146): nothing may stick out of the
 * window or make the page scroll sideways, and Hebrew and Arabic must run right to left. Screenshots
 * (screenshots.spec.ts) are for a person to look at; this is the check a machine can make in every language.
 */

const LANGUAGES = ["en", "es", "ru", "he", "ar"] as const;
type Language = (typeof LANGUAGES)[number];

const VIEWPORTS = {
  phone: { width: 360, height: 780 },
  tablet: { width: 820, height: 1100 },
  desktop: { width: 1280, height: 800 },
} as const;

// Long words and a long title, the content most likely to push a layout wider than the window.
const RECIPE: SeedRecipe = {
  title: "Grandmother's slow-roasted Mediterranean vegetable and chickpea traybake with tahini",
  servings: 4,
  calories: 2100,
  estimated_time_minutes: 75,
  effort_level: "Medium",
  cost_estimate: "$$",
  tags: ["vegetarian", "dinner", "meal-prep"],
  original_url: "https://www.example.com/recipes/grandmothers-slow-roasted-mediterranean-vegetable-traybake",
  ingredients: [
    { name: "chickpeas, drained and rinsed", quantity: 800, unit: "g", metric: { quantity: 800, unit: "g" }, spoons: { quantity: 28, unit: "oz" } },
    { name: "extra-virgin olive oil", quantity: 3, unit: "tbsp", metric: { quantity: 45, unit: "ml" }, spoons: { quantity: 3, unit: "tbsp" } },
    { name: "Worcestershire sauce", quantity: 1, unit: "tsp" },
    { name: "tahini", quantity: 0.25, unit: "cup", metric: { quantity: 60, unit: "ml" }, spoons: { quantity: 0.25, unit: "cup" } },
  ],
  instructions: [
    { step: 1, text: "Heat the oven to 220°C. Toss everything except the tahini with the oil and plenty of salt." },
    { step: 2, text: "Roast for 45 minutes, turning once, until the edges are deeply browned and crisp." },
  ],
};

const SIGNED_IN_PAGES = [
  "/app",
  "/app?view=list",
  "/app/hub",
  "/app/add",
  "/app/list",
  "/app/cookbook",
  "/app/settings",
  "/app/settings/account",
  "/app/settings/recipe",
  "/app/settings/appearance",
  "/app/settings/language",
  "/app/settings/emails",
  "/app/settings/credits",
  "/app/settings/support",
  "/app/settings/legal",
  "/app/recipe/edit",
];

let recipePath: string;
let hubPath: string;
let sharePath: string;

test.beforeAll(async () => {
  const [id] = await resetLibrary([RECIPE, { title: "Miso soup", tags: ["soup"] }, { title: "Pad thai", is_favorite: true }]);
  recipePath = `/app/recipe/${id}`;
  await resetShoppingList([{ name: "chickpeas", quantity: 800, unit: "g" }, { name: "tahini" }, { name: "lemons", checked: true }]);
  const [card] = await resetHub([{ name: "Roasted cauliflower with a very long name that needs to wrap", tags: ["dinner"] }]);
  hubPath = `/app/hub/${card.id}`;
  const [share] = await resetShares(["Shared traybake with a long name for wrapping"]);
  sharePath = `/app/s/${share.token}`;
});

test.afterAll(async () => {
  await resetTestUserLanguage();
  await resetHub([]);
});

async function newContext(browser: Browser, viewport: keyof typeof VIEWPORTS, language: Language) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: VIEWPORTS[viewport] });
  await context.addInitScript((lang: string) => localStorage.setItem("pinch:appLanguage", lang), language);
  return context;
}

/** Elements drawn outside the window (only the outermost of each, and none inside a box that scrolls or clips). */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) {
      problems.push(`the page scrolls sideways: ${document.documentElement.scrollWidth}px of content in a ${width}px window`);
    }
    const insideClippingBox = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== "visible") return true;
      }
      return false;
    };
    const outside: Element[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      if (!(element instanceof HTMLElement) || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || (box.right <= width + 1 && box.left >= -1)) continue;
      if (insideClippingBox(element) || outside.some((parent) => parent.contains(element))) continue;
      outside.push(element);
    }
    for (const element of outside.slice(0, 5)) {
      const box = element.getBoundingClientRect();
      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      problems.push(`<${element.tagName.toLowerCase()} class="${element.className}"> "${text}" spans ${Math.round(box.left)}–${Math.round(box.right)}px`);
    }
    return problems;
  });
}

async function check(page: Page, path: string, language: Language) {
  await page.goto(path);
  const loaded = await page
    .locator("h1:visible")
    .first()
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!loaded) return [`${path}: no heading after 15 s`];
  // Let lists, photos and translated text arrive before measuring.
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
  await expect(page.locator("html"), path).toHaveAttribute("dir", language === "he" || language === "ar" ? "rtl" : "ltr");
  return (await layoutProblems(page)).map((problem) => `${path}: ${problem}`);
}

async function signIn(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/app/auth?mode=signin");
  // By field name, not label: the page is already in the language under test.
  await page.locator('input[name="email"]').fill(TEST_USER.email);
  await page.locator('input[name="password"]').fill(TEST_USER.password);
  await page.locator('input[name="password"]').press("Enter");
  await page.locator("#main h1:visible").waitFor();
  return page;
}

for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
  for (const language of LANGUAGES) {
    test(`every page fits the window: ${viewport}, ${language}`, async ({ browser }) => {
      test.setTimeout(300_000);
      const problems: string[] = [];

      const guest = await newContext(browser, viewport, language);
      const guestPage = await guest.newPage();
      await stubRecipeShare(guestPage);
      for (const path of ["/app/welcome", "/app/auth?mode=signin", "/app/auth?mode=signup", hubPath, sharePath]) {
        problems.push(...(await check(guestPage, path, language)));
      }
      await guest.close();

      // The account's language wins over the browser's once signed in (PIN-154), so set it there too.
      await writeAccountPrefs({ locale: language, prefs: { scheme: "light", pack: "mist", measurement: "original" } });
      const context = await newContext(browser, viewport, language);
      const page = await signIn(context);
      for (const path of [...SIGNED_IN_PAGES, recipePath, `${recipePath}/edit`]) {
        problems.push(...(await check(page, path, language)));
      }
      await context.close();

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}

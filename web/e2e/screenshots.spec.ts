import { test, type Browser } from "@playwright/test";

import { resetLibrary, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

/**
 * Screenshots of the shell for review: phone, tablet and desktop, English and Hebrew, light and dark.
 * Only when asked: SCREENSHOTS=<folder> npm run test:e2e -- screenshots
 */
const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, "Set SCREENSHOTS=<folder> to take screenshots.");

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1100 },
  desktop: { width: 1440, height: 900 },
} as const;

type Prefs = { language: "en" | "he"; scheme: "light" | "dark"; pack?: string };

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

async function open(browser: Browser, viewport: keyof typeof VIEWPORTS, prefs: Prefs, path = "/app") {
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
    localStorage.setItem("pinch.themePack", p.pack ?? "mist");
  }, prefs);
  const page = await context.newPage();
  await page.goto(path);
  await page.locator("#main h1").waitFor();
  await page.waitForTimeout(300);
  return { page, context };
}

for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
  for (const language of ["en", "he"] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`shell ${viewport} ${language} ${scheme}`, async ({ browser }) => {
        const { page, context } = await open(browser, viewport, { language, scheme });
        await page.screenshot({ path: `${OUT}/${viewport}-${language}-${scheme}.png` });
        await context.close();
      });
    }
  }
}

test("account menu, desktop", async ({ browser }) => {
  for (const [language, scheme] of [["en", "light"], ["he", "dark"]] as const) {
    const { page, context } = await open(browser, "desktop", { language, scheme });
    await page.getByRole("button", { name: language === "en" ? "Account, theme and language" : "חשבון, ערכת נושא ושפה" }).filter({ visible: true }).first().click();
    await page.getByRole("menuitem").filter({ hasText: language === "en" ? "Color theme" : "ערכת צבעים" }).hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/menu-desktop-${language}-${scheme}.png` });
    await context.close();
  }
});

test("theme packs, desktop", async ({ browser }) => {
  for (const pack of ["fruity", "dracula", "sunny"]) {
    const { page, context } = await open(browser, "desktop", { language: "en", scheme: pack === "dracula" ? "dark" : "light", pack }, "/app/hub");
    await page.screenshot({ path: `${OUT}/pack-${pack}.png` });
    await context.close();
  }
});

test("sign-in page", async ({ browser }) => {
  for (const viewport of ["phone", "desktop"] as const) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: VIEWPORTS[viewport], deviceScaleFactor: viewport === "desktop" ? 1 : 2 });
    const page = await context.newPage();
    await page.goto("/app/auth?mode=signin");
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await page.screenshot({ path: `${OUT}/signin-${viewport}.png` });
    await context.close();
  }
});

/** A flat picture standing in for a recipe photo, so the cards look as they do with real ones. */
const picture = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue + 40} 70% 45%)"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/></svg>`,
  )}`;

const LIBRARY: SeedRecipe[] = [
  { title: "Creamy lemon pasta with garlic and parmesan", is_favorite: true, estimated_time_minutes: 25, effort_level: "Easy", cost_estimate: "$", tags: ["pasta", "dinner"], image_url: picture(40) },
  { title: "Chocolate lava cake", estimated_time_minutes: 90, effort_level: "Hard", cost_estimate: "$$", tags: ["dessert"], image_url: picture(15) },
  { title: "Green salad", estimated_time_minutes: 10, effort_level: "Easy", cost_estimate: "$", tags: ["salad"] },
  { title: "Slow-cooked beef ragu", estimated_time_minutes: 195, effort_level: "Medium", cost_estimate: "$$$", tags: ["pasta", "dinner"], image_url: picture(0) },
  { title: "Shakshuka", is_favorite: true, estimated_time_minutes: 30, effort_level: "Easy", cost_estimate: "$", tags: ["breakfast"], image_url: picture(8) },
  { title: "Miso soup", estimated_time_minutes: 15, effort_level: "Easy", tags: ["soup"], image_url: picture(100) },
  { title: "Pad thai", estimated_time_minutes: 35, effort_level: "Medium", cost_estimate: "$$", tags: ["dinner"], image_url: picture(30) },
  { title: "Banana bread", estimated_time_minutes: 70, effort_level: "Easy", cost_estimate: "$", tags: ["dessert", "breakfast"] },
  { title: "Falafel wrap", estimated_time_minutes: 45, effort_level: "Medium", tags: ["dinner"], image_url: picture(70) },
];

test("library", async ({ browser }) => {
  await resetLibrary(LIBRARY.map((recipe, index) => ({ ...recipe, createdSecondsAgo: index + 1 })));
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["en", "dark"], ["he", "light"]] as const) {
      const { page, context } = await open(browser, viewport, { language, scheme });
      await page.locator("#main article").first().waitFor();
      await page.screenshot({ path: `${OUT}/library-${viewport}-${language}-${scheme}.png`, fullPage: viewport !== "desktop" });
      await context.close();
    }
  }
  // Filters open, and the list layout, on desktop and phone.
  for (const viewport of ["desktop", "phone"] as const) {
    const { page, context } = await open(browser, viewport, { language: "en", scheme: "light" }, "/app?sort=title_asc&tag=dinner");
    await page.locator("#main article").first().waitFor();
    await page.getByRole("radio", { name: "Show as list" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/library-list-filters-${viewport}.png`, fullPage: true });
    await context.close();
  }
});

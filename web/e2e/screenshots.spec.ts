import { test, type Browser, type Page } from "@playwright/test";

import { createUser, resetLibrary, resetTestUserLanguage, uniqueEmail, type SeedRecipe } from "./admin";
import { createAdminPagesUsers, deleteAdminPagesUsers } from "./adminSeed";
import { signInWithPassword } from "./helpers";
import { resetHub } from "./hubSeed";
import { resetShoppingList } from "./listSeed";
import { setRecipeVideo } from "./cookSeed";
import { writeAccountPrefs } from "./prefsSeed";
import { resetShares, stubRecipeShare } from "./shareSeed";
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

test.afterAll(async () => {
  await resetTestUserLanguage();
});

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
  // The account's choices win over this browser's once loaded (PIN-154), so set them there too.
  await writeAccountPrefs({ locale: prefs.language, prefs: { scheme: prefs.scheme, pack: prefs.pack ?? "mist", measurement: "original" } });
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

const RECIPE: SeedRecipe = {
  title: "Creamy lemon pasta with garlic and parmesan",
  image_url: picture(40),
  servings: 4,
  calories: 2400,
  estimated_time_minutes: 25,
  effort_level: "Easy",
  cost_estimate: "$",
  tags: ["pasta", "dinner"],
  original_url: "https://example.com/lemon-pasta",
  ingredients: [
    { name: "spaghetti", quantity: 400, unit: "g", metric: { quantity: 400, unit: "g" }, spoons: { quantity: 14, unit: "oz" } },
    { name: "butter", quantity: 3, unit: "tbsp", metric: { quantity: 42, unit: "g" }, spoons: { quantity: 3, unit: "tbsp" } },
    { name: "garlic cloves, finely chopped", quantity: 4, unit: "" },
    { name: "heavy cream", quantity: 0.75, unit: "cup", metric: { quantity: 180, unit: "ml" }, spoons: { quantity: 0.75, unit: "cup" } },
    { name: "lemon, zest and juice", quantity: 1, unit: "" },
    { name: "parmesan, grated", quantity: 0.5, unit: "cup", metric: { quantity: 50, unit: "g" }, spoons: { quantity: 0.5, unit: "cup" } },
    { name: "salt", quantity: 1, unit: "pinch" },
  ],
  instructions: [
    { step: 1, text: "Cook the spaghetti in well-salted water until just tender. Keep 1 cup of the pasta water." },
    { step: 2, text: "Melt 3 tbsp butter in a wide pan and soften the garlic for a minute, without letting it brown." },
    { step: 3, text: "Add the cream, lemon zest and juice, and simmer for 2 minutes." },
    { step: 4, text: "Toss in the pasta and parmesan, loosening with pasta water until glossy. Season and serve." },
  ],
};

const SHAKSHUKA: SeedRecipe = {
  title: "שקשוקה של שבת",
  source_language: "he",
  servings: 2,
  estimated_time_minutes: 30,
  effort_level: "Easy",
  ingredients: [
    { name: "ביצים", quantity: 4, unit: "" },
    { name: "olive oil", quantity: 2, unit: "tbsp" },
    { name: "עגבניות מרוסקות", quantity: 400, unit: "g" },
    { name: "פפריקה מתוקה", quantity: 1, unit: "tsp" },
  ],
  instructions: [
    { step: 1, text: "מחממים 2 כפות שמן זית במחבת רחבה." },
    { step: 2, text: "מוסיפים את העגבניות והפפריקה ומבשלים 10 דקות." },
    { step: 3, text: "שוברים פנימה את הביצים, מכסים ומבשלים עד שהחלבון מתייצב." },
  ],
};

test("recipe page", async ({ browser }) => {
  const [pasta, shakshuka] = await resetLibrary([
    { ...RECIPE, createdSecondsAgo: 1 },
    { ...SHAKSHUKA, createdSecondsAgo: 2 },
  ]);
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["en", "dark"], ["he", "light"]] as const) {
      const { page, context } = await open(browser, viewport, { language, scheme }, `/app/recipe/${pasta}`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/recipe-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await context.close();
    }
  }
  // Mixed direction: a Hebrew recipe in the English app, on desktop and phone.
  for (const viewport of ["desktop", "phone"] as const) {
    const { page, context } = await open(browser, viewport, { language: "en", scheme: "light" }, `/app/recipe/${shakshuka}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/recipe-hebrew-in-en-${viewport}.png`, fullPage: true });
    await context.close();
  }
});

const SCREENS = [
  ["snap", "/app/add"],
  ["list", "/app/list"],
  ["hub", "/app/hub"],
  ["settings", "/app/settings"],
  ["settings-recipe", "/app/settings/recipe"],
] as const;

test("snap, list, hub and settings", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetShoppingList([
    { name: "onion", quantity: 2 },
    { name: "garlic", quantity: 1, unit: "head" },
    { name: "milk", quantity: 1, unit: "l" },
    { name: "eggs", quantity: 6 },
    { name: "parmesan", quantity: 100, unit: "g" },
    { name: "salt" },
    { name: "olive oil", checked: true },
  ]);
  await resetHub([
    { name: "Crispy smashed potatoes", platform: "tiktok", save_count: 41, tags: ["dinner"] },
    { name: "Miso ramen", platform: "youtube", save_count: 22, tags: ["soup"] },
    { name: "Lemon olive oil cake", platform: "instagram", save_count: 9, tags: ["dessert"] },
    { name: "One-pan gnocchi", platform: "web", save_count: 5, tags: ["dinner"] },
  ]);
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["he", "light"], ["en", "dark"]] as const) {
      if (viewport === "tablet" && scheme === "dark") continue;
      for (const [name, path] of SCREENS) {
        const { page, context } = await open(browser, viewport, { language, scheme }, path);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${name}-${viewport}-${language}-${scheme}.png`, fullPage: true });
        await context.close();
      }
    }
  }
});

test("snap, waiting for an import", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const viewport of ["phone", "desktop"] as const) {
    for (const [language, scheme] of [["en", "light"], ["he", "light"], ["en", "dark"]] as const) {
      const { page, context } = await open(browser, viewport, { language, scheme }, "/app/add");
      // The import never answers, and the clock is moved on 8 seconds so the ring and countdown are part way.
      await page.route("**/functions/v1/extract-recipe", () => new Promise(() => {}));
      await page.clock.install();
      await page.locator('#main input[type="url"]').fill("https://www.tiktok.com/@cook/video/7312345678901234567");
      await page.locator('#main input[type="url"]').press("Enter");
      await page.getByRole("progressbar").waitFor();
      await page.clock.runFor(8_000);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/snap-waiting-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await context.close();
    }
  }
});

test("hub recipe, as a guest", async ({ browser }) => {
  const [card] = await resetHub([{ name: "Guest gnocchi", platform: "web", save_count: 3 }]);
  for (const viewport of ["desktop", "phone"] as const) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: VIEWPORTS[viewport], deviceScaleFactor: viewport === "desktop" ? 1 : 2 });
    const page = await context.newPage();
    await page.goto(`/app/hub/${card.id}`);
    await page.locator("#main h1").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/hub-guest-${viewport}.png`, fullPage: true });
    await context.close();
  }
  await resetHub([]);
});

const COOK_ALONG: SeedRecipe = {
  ...RECIPE,
  title: "Smashed potatoes",
  original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  image_url: picture(25),
};

test("editor, credits, recipe actions and cook mode", async ({ browser }) => {
  test.setTimeout(900_000);
  const [pasta, potatoes] = await resetLibrary([
    { ...RECIPE, createdSecondsAgo: 1 },
    { ...COOK_ALONG, createdSecondsAgo: 2 },
  ]);
  // A YouTube recipe with timed steps, so cook along has a player and step times to jump to.
  await setRecipeVideo(potatoes, {
    platform: "youtube",
    original_url: COOK_ALONG.original_url ?? "",
    instructions: (RECIPE.instructions ?? []).map((step, index) => ({ ...step, timestamp_seconds: 20 + index * 45 })),
  });
  const screens = [
    ["editor-edit", `/app/recipe/edit?id=${pasta}`],
    ["editor-new", "/app/recipe/edit"],
    ["credits", "/app/settings/credits"],
  ] as const;
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["he", "light"], ["en", "dark"]] as const) {
      if (viewport === "tablet" && scheme === "dark") continue;
      for (const [name, path] of screens) {
        const { page, context } = await open(browser, viewport, { language, scheme }, path);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${name}-${viewport}-${language}-${scheme}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  for (const viewport of ["desktop", "phone"] as const) {
    for (const [language, scheme] of [["en", "light"], ["he", "dark"]] as const) {
      const prefs = { language, scheme };
      // The open dialogs: Remix, Translate and More.
      for (const [name, open_] of [
        ["remix", (p: Page) => p.getByRole("group", { name: /^(Actions for|פעולות)/ }).getByRole("button").first().click()],
        ["more", (p: Page) => p.getByRole("group", { name: /^(Actions for|פעולות)/ }).getByRole("button").last().click()],
      ] as const) {
        const { page, context } = await open(browser, viewport, prefs, `/app/recipe/${pasta}`);
        await open_(page);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/action-${name}-${viewport}-${language}-${scheme}.png` });
        await context.close();
      }

      // Cook mode, on the second step.
      {
        const { page, context } = await open(browser, viewport, prefs, `/app/recipe/${pasta}`);
        await page.getByRole("button", { name: /^(Cook mode|מצב בישול)$/ }).first().click();
        await page.keyboard.press(language === "he" ? "ArrowLeft" : "ArrowRight");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/cook-mode-${viewport}-${language}-${scheme}.png` });
        await context.close();
      }

      // Cook along, with the player open (the video site is blocked, so the frame stays empty).
      {
        const { page, context } = await open(browser, viewport, prefs, `/app/recipe/${potatoes}`);
        await context.route(/youtube|ytimg|googlevideo/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
        await page.locator("[aria-expanded]").filter({ hasText: "YouTube" }).first().click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/cook-along-${viewport}-${language}-${scheme}.png` });
        await context.close();
      }
    }
  }
});

test("shared recipe, as a guest", async ({ browser }) => {
  const [share] = await resetShares(["Shared lentil soup"]);
  for (const viewport of ["desktop", "phone"] as const) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: VIEWPORTS[viewport], deviceScaleFactor: viewport === "desktop" ? 1 : 2 });
    const page = await context.newPage();
    await stubRecipeShare(page);
    await page.goto(`/app/s/${share.token}`);
    await page.locator("#main h1").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/share-guest-${viewport}.png`, fullPage: true });
    await context.close();
  }
  await resetShares([]);
});

/** A context with no session, in a language, for the pages people see before signing in. */
async function openSignedOut(browser: Browser, viewport: keyof typeof VIEWPORTS, language: "en" | "he", path: string) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: viewport === "desktop" ? 1 : 2,
  });
  await context.addInitScript((lang: string) => localStorage.setItem("pinch:appLanguage", lang), language);
  const page = await context.newPage();
  await page.goto(path);
  return { page, context };
}

test("welcome and onboarding", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const viewport of ["desktop", "tablet", "phone"] as const) {
    for (const language of ["en", "he"] as const) {
      const { page, context } = await openSignedOut(browser, viewport, language, "/app/welcome");
      await page.locator("h1").first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/welcome-${viewport}-${language}.png`, fullPage: true });
      await context.close();
    }
  }
  // Onboarding is only offered to a new account: one per run.
  const email = uniqueEmail("e2e-shots-onboarding");
  await createUser(email, TEST_USER.password);
  for (const viewport of ["desktop", "phone"] as const) {
    for (const language of ["en", "he"] as const) {
      const { page, context } = await openSignedOut(browser, viewport, language, "/app/auth?mode=signin&next=%2Fonboarding");
      await signInWithPassword(page, email, TEST_USER.password);
      await page.waitForURL(/\/app\/onboarding/);
      await page.locator("h1").first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/onboarding-${viewport}-${language}.png`, fullPage: true });
      await context.close();
    }
  }
});

test("cookbook and first recipe", async ({ browser }) => {
  test.setTimeout(300_000);
  await resetLibrary(LIBRARY.map((recipe, index) => ({ ...recipe, createdSecondsAgo: index + 1 })));
  for (const viewport of ["desktop", "phone"] as const) {
    for (const [language, scheme] of [["en", "light"], ["he", "dark"]] as const) {
      const { page, context } = await open(browser, viewport, { language, scheme }, "/app/cookbook");
      await page.waitForTimeout(600);
      // Pick the first three recipes so the book panel has contents.
      const options = page.locator("#main").getByRole("checkbox");
      for (let i = 0; i < 3 && i < (await options.count()); i += 1) await options.nth(i).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/cookbook-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await context.close();
    }
  }
  await resetLibrary([]);
  for (const viewport of ["desktop", "phone"] as const) {
    const { page, context } = await open(browser, viewport, { language: "en", scheme: "light" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/first-recipe-${viewport}.png`, fullPage: true });
    await context.close();
  }
});

test("admin pages", async ({ browser }) => {
  test.setTimeout(300_000);
  const users = await createAdminPagesUsers();
  try {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1366, height: 860 } });
    const page = await context.newPage();
    await page.goto("/app/auth?mode=signin");
    await signInWithPassword(page, users.admin.email, users.admin.password);
    await page.locator("#main").waitFor();
    for (const name of ["dashboard", "insights", "users", "usage", "activity", "messages"]) {
      await page.goto(`/app/admin/${name}`);
      await page.locator("#main h1").first().waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: true });
    }
    await context.close();
  } finally {
    await deleteAdminPagesUsers(users);
  }
});

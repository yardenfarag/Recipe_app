import { test, type Browser, type Page } from "@playwright/test";

import { createUser, resetLibrary, resetTestUserLanguage, uniqueEmail, type SeedRecipe } from "./admin";
import { createAdminPagesUsers, deleteAdminPagesUsers } from "./adminSeed";
import { signInWithPassword } from "./helpers";
import { addListItemsAs, householdOf, newAccount, setFoodAvatar, type Account } from "./householdSeed";
import { resetHub } from "./hubSeed";
import { resetShoppingList } from "./listSeed";
import { PHOTOS, resetPantry, stubScanPantry } from "./pantrySeed";
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
    // Silent speech with an English and a Hebrew voice, so cook mode's speaker button looks the same on every
    // machine and a screenshot run never talks.
    class Utterance {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.assign(window, { SpeechSynthesisUtterance: Utterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [
          { voiceURI: "en", lang: "en-US", name: "English", localService: true, default: true },
          { voiceURI: "he", lang: "he-IL", name: "Hebrew", localService: true, default: false },
        ],
        speak: (utterance: Utterance) => setTimeout(() => utterance.onend?.(), 50),
        cancel: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  }, prefs);
  // The account's choices win over this browser's once loaded (PIN-154), so set them there too.
  await writeAccountPrefs({ locale: prefs.language, prefs: { scheme: prefs.scheme, pack: prefs.pack ?? "mist", measurement: "original" } });
  const page = await context.newPage();
  await page.goto(path);
  await page.locator("#main h1:visible").waitFor();
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
  { title: "Chocolate lava cake", estimated_time_minutes: 90, effort_level: "Hard", cost_estimate: "$$", tags: ["dessert"], image_url: picture(15), platform: "instagram" },
  { title: "Green salad", estimated_time_minutes: 10, effort_level: "Easy", cost_estimate: "$", tags: ["salad"], platform: "photo", cookedDaysAgo: 1 },
  { title: "Slow-cooked beef ragu", estimated_time_minutes: 195, effort_level: "Medium", cost_estimate: "$$$", tags: ["pasta", "dinner"], image_url: picture(0) },
  {
    title: "Shakshuka",
    is_favorite: true,
    estimated_time_minutes: 30,
    effort_level: "Easy",
    cost_estimate: "$",
    servings: 4,
    tags: ["breakfast"],
    image_url: picture(8),
    platform: "tiktok",
    original_url: "https://www.tiktok.com/@lazy.chef/video/7312345678901234567",
  },
  { title: "Miso soup", estimated_time_minutes: 15, effort_level: "Easy", tags: ["soup"], image_url: picture(100), platform: "youtube", cookedDaysAgo: 2 },
  { title: "Pad thai", estimated_time_minutes: 35, effort_level: "Medium", cost_estimate: "$$", tags: ["dinner"], image_url: picture(30), cookedDaysAgo: 4 },
  { title: "Banana bread", estimated_time_minutes: 70, effort_level: "Easy", cost_estimate: "$", tags: ["dessert", "breakfast"] },
  { title: "Falafel wrap", estimated_time_minutes: 45, effort_level: "Medium", tags: ["dinner"], image_url: picture(70) },
];

test("library", async ({ browser }) => {
  test.setTimeout(120_000);
  await resetLibrary(LIBRARY.map((recipe, index) => ({ ...recipe, createdSecondsAgo: index + 1 })));
  // Something on the list, so its tile has rows to tick.
  await resetShoppingList([{ name: "eggs", checked: true }, { name: "crushed tomatoes" }, { name: "feta" }, { name: "parsley" }, { name: "pita" }]);
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["en", "dark"], ["he", "light"]] as const) {
      const { page, context } = await open(browser, viewport, { language, scheme });
      await page.locator("#main article:visible").first().waitFor();
      await page.screenshot({ path: `${OUT}/library-${viewport}-${language}-${scheme}.png`, fullPage: viewport !== "desktop" });
      await context.close();
    }
  }
  // Filters open, and the list layout, on desktop and phone.
  for (const viewport of ["desktop", "phone"] as const) {
    const { page, context } = await open(browser, viewport, { language: "en", scheme: "light" }, "/app?sort=title_asc&tag=dinner");
    await page.locator("#main article:visible").first().waitFor();
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
  nutrition: { protein_g: 80, carbs_g: 280, fat_g: 107 },
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
  test.setTimeout(120_000);
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

const PANTRY_ITEMS = {
  en: [
    ["Milk", "fridge", "dairy"],
    ["Eggs", "fridge", "dairy"],
    ["White cheese", "fridge", "dairy"],
    ["Tahini", "fridge", "pantry"],
    ["Grapes", "fridge", "produce"],
    ["Cauliflower", "fridge", "produce"],
    ["Frozen peas", "freezer", "frozen"],
    ["Pita", "freezer", "bakery"],
    ["Rice", "cupboard", "pantry"],
    ["Brown sugar", "cupboard", "pantry"],
    ["Sweet paprika", "cupboard", "spices"],
    ["Canned chickpeas", "cupboard", "pantry"],
    ["Coconut oil", "cupboard", "pantry"],
    ["Avocado", "other", "produce"],
  ],
  he: [
    ["חלב", "fridge", "dairy"],
    ["ביצים", "fridge", "dairy"],
    ["גבינה לבנה", "fridge", "dairy"],
    ["טחינה", "fridge", "pantry"],
    ["ענבים", "fridge", "produce"],
    ["כרובית", "fridge", "produce"],
    ["אפונה קפואה", "freezer", "frozen"],
    ["פיתות", "freezer", "bakery"],
    ["אורז", "cupboard", "pantry"],
    ["סוכר חום", "cupboard", "pantry"],
    ["פפריקה מתוקה", "cupboard", "spices"],
    ["חומוס משומר", "cupboard", "pantry"],
    ["שמן קוקוס", "cupboard", "pantry"],
    ["אבוקדו", "other", "produce"],
  ],
} as const;

const SCAN_ANSWERS = {
  en: [
    { items: [{ name: "Milk", aisle: "dairy", brand: "Tnuva" }, { name: "Eggs", aisle: "dairy" }, { name: "Tahini", aisle: "pantry", brand: "Har Bracha" }, { name: "Grapes", aisle: "produce" }, { name: "Leftovers in a red tub", confidence: "low" as const, container_unknown: true }] },
    { quality: "too_dark", items: [{ name: "White cheese", aisle: "dairy", confidence: "low" as const }] },
    { items: [{ name: "Sweet paprika", aisle: "spices", brand: "Carrefour" }, { name: "Brown sugar", aisle: "pantry", brand: "Sugat" }, { name: "Flour", aisle: "pantry", confidence: "low" as const }] },
  ],
  he: [
    { items: [{ name: "חלב", aisle: "dairy", brand: "תנובה" }, { name: "ביצים", aisle: "dairy" }, { name: "טחינה", aisle: "pantry", brand: "הר ברכה" }, { name: "ענבים", aisle: "produce" }, { name: "שאריות בקופסה אדומה", confidence: "low" as const, container_unknown: true }] },
    { quality: "too_dark", items: [{ name: "גבינה לבנה", aisle: "dairy", confidence: "low" as const }] },
    { items: [{ name: "פפריקה מתוקה", aisle: "spices", brand: "Carrefour" }, { name: "סוכר חום", aisle: "pantry", brand: "סוגת" }, { name: "קמח", aisle: "pantry", confidence: "low" as const }] },
  ],
};

test("pantry: page, scan, review, phone code and What can I cook", async ({ browser }) => {
  test.setTimeout(300_000);
  await resetLibrary([
    { ...RECIPE, title: "Shakshuka", ingredients: [{ name: "eggs", quantity: 4, unit: "" }, { name: "sweet paprika", quantity: 1, unit: "tsp" }, { name: "crushed tomatoes", quantity: 400, unit: "g" }] },
  ]);
  for (const viewport of ["phone", "tablet", "desktop"] as const) {
    for (const [language, scheme] of [["en", "light"], ["he", "light"], ["en", "dark"], ["he", "dark"]] as const) {
      if (viewport === "tablet" && scheme === "dark") continue;
      const tag = `${viewport}-${language}-${scheme}`;
      await resetPantry(
        PANTRY_ITEMS[language].map(([name, place, aisle], index) => ({
          name,
          place,
          aisle,
          last_seen_at: new Date(Date.now() - (index % 3) * 86_400_000 * 2).toISOString(),
        })),
      );

      // The Pantry page.
      let { page, context } = await open(browser, viewport, { language, scheme }, "/app/settings/pantry");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/pantry-${tag}.png`, fullPage: true });
      await context.close();

      // A scan: three photos, one too dark.
      ({ page, context } = await open(browser, viewport, { language, scheme }, "/app/pantry/scan?place=fridge"));
      await stubScanPantry(page, SCAN_ANSWERS[language]);
      await page.locator('#main input[type="file"]').first().setInputFiles(PHOTOS);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/pantry-scan-${tag}.png`, fullPage: true });
      await page.locator('#main [data-track="pantry.scan.review"]').click();
      await page.locator("#main h1:visible").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/pantry-review-${tag}.png`, fullPage: true });
      await context.close();

      // The phone code (computers only), connected.
      if (viewport !== "phone") {
        ({ page, context } = await open(browser, viewport, { language, scheme }, "/app/pantry/scan"));
        await page.route("**/functions/v1/photo-handoff", async (route) => {
          const body = route.request().postDataJSON() as { action: string };
          if (body.action === "create") await route.fulfill({ json: { status: "ok", handoff: { id: "00000000-0000-4000-8000-000000000001", token: "abcdefghijklmnopqrstuvwxyz012345", expires_at: new Date(Date.now() + 900_000).toISOString() } } });
          else await route.fulfill({ json: { status: "ok", state: "connected" } });
        });
        await page.getByRole("button", { name: language === "en" ? "Use your phone’s camera" : "צילום מהטלפון" }).click();
        await page.waitForTimeout(2600);
        await page.screenshot({ path: `${OUT}/pantry-phone-code-${tag}.png` });
        await context.close();
      }

      // What can I cook.
      ({ page, context } = await open(browser, viewport, { language, scheme }, "/app"));
      await page.getByRole("button", { name: language === "en" ? "What can I cook?" : "מה אפשר לבשל?" }).filter({ visible: true }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/pantry-cook-${tag}.png` });
      await context.close();
    }
  }

  // The page the QR code opens, on a phone.
  for (const [language, scheme] of [["en", "light"], ["he", "dark"]] as const) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: VIEWPORTS.phone, deviceScaleFactor: 2, colorScheme: scheme });
    await context.addInitScript((p: Prefs) => {
      localStorage.setItem("pinch:appLanguage", p.language);
      localStorage.setItem("pinch.themePreference", p.scheme);
    }, { language, scheme });
    const page = await context.newPage();
    await page.route("**/functions/v1/photo-handoff", async (route) => {
      const body = route.request().postDataJSON() as { action: string };
      if (body.action === "open") await route.fulfill({ json: { status: "ok", purpose: "pantry", place: "fridge", language, expires_at: new Date(Date.now() + 600_000).toISOString() } });
      else await route.fulfill({ json: { status: "ok", photo: { id: null, scan_id: "s", place: "fridge", quality: "ok", truncated: false, from_phone: true, created_at: new Date().toISOString(), items: [{ name: "x", name_en: "x", brand: "", aisle: "other", confidence: "high", container_unknown: false }, { name: "y", name_en: "y", brand: "", aisle: "other", confidence: "high", container_unknown: false }] } } });
    });
    await page.goto("/app/phone#abcdefghijklmnopqrstuvwxyz012345");
    await page.locator("main h1").waitFor();
    await page.locator('input[type="file"][multiple]').setInputFiles(PHOTOS);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/pantry-phone-page-${language}-${scheme}.png`, fullPage: true });
    await context.close();
  }
  await resetPantry([]);
  await resetLibrary([]);
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
    await page.locator("#main h1:visible").waitFor();
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
        ["more", (p: Page) => p.getByRole("button", { name: /^(More options|אפשרויות נוספות)$/ }).filter({ visible: true }).first().click()],
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
        await page.getByRole("button", { name: /^(Start cooking|מתחילים לבשל)$/ }).filter({ visible: true }).first().click();
        await page.keyboard.press(language === "he" ? "ArrowLeft" : "ArrowRight");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/cook-mode-${viewport}-${language}-${scheme}.png` });
        // With the speaker on: the button lit, and "Read again" by the step number.
        await page.getByRole("dialog").getByRole("button", { name: /^(Read steps aloud|הקראת השלבים)$/ }).click();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/cook-mode-reading-${viewport}-${language}-${scheme}.png` });
        await context.close();
      }

      // Cook along, with the player open (the video site is blocked, so the frame stays empty).
      {
        const { page, context } = await open(browser, viewport, prefs, `/app/recipe/${potatoes}`);
        await context.route(/youtube|ytimg|googlevideo/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
        await page.getByRole("button", { name: /^(Cook along|מבשלים עם הסרטון)/ }).filter({ visible: true }).first().click();
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
    await page.locator("#main h1:visible").waitFor();
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
      await page.locator("h1:visible").first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/welcome-${viewport}-${language}.png`, fullPage: true });
      await context.close();
    }
  }
  // Onboarding is only offered to a new account that hasn't finished it: a fresh one for each picture.
  for (const viewport of ["desktop", "phone"] as const) {
    for (const language of ["en", "he"] as const) {
      const email = uniqueEmail("e2e-shots-onboarding");
      await createUser(email, TEST_USER.password);
      // Signed in in English (the sign-in helper finds fields by their English labels), then switched on the account.
      const { page, context } = await openSignedOut(browser, viewport, "en", "/app/auth?mode=signin&next=%2Fonboarding");
      await signInWithPassword(page, email, TEST_USER.password);
      await page.waitForURL(/\/app\/onboarding/);
      if (language !== "en") {
        await writeAccountPrefs({ locale: language }, email, TEST_USER.password);
        await page.evaluate((lang) => localStorage.setItem("pinch:appLanguage", lang), language);
        await page.reload();
      }
      await page.locator("h1:visible").first().waitFor();
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

      // The dialog while the server makes the PDF, once it's downloaded, and when it couldn't be made.
      let answer: "slow" | "pdf" | "fail" = "slow";
      await page.route("**/app/api/cookbook/pdf", async (route) => {
        if (answer === "slow") await new Promise((resolve) => setTimeout(resolve, 4_000));
        await route
          .fulfill(
            answer === "fail"
              ? { status: 503, body: "{}" }
              : { status: 200, contentType: "application/pdf", headers: { "X-Cookbook-Missing-Photos": "1" }, body: "%PDF-1.7" },
          )
          .catch(() => undefined);
      });
      const create = page.locator("#main").getByRole("button", { name: /PDF/ }).last();
      await create.click();
      await page.getByRole("dialog").getByRole("progressbar").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/cookbook-making-${viewport}-${language}-${scheme}.png` });
      await page.getByRole("dialog").getByRole("button").last().waitFor();
      await page.keyboard.press("Escape");
      answer = "pdf";
      await create.click();
      await page.getByRole("dialog").getByRole("button").nth(2).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/cookbook-ready-${viewport}-${language}-${scheme}.png` });
      await page.keyboard.press("Escape");
      answer = "fail";
      await create.click();
      await page.getByRole("dialog").getByRole("button").nth(2).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/cookbook-failed-${viewport}-${language}-${scheme}.png` });
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
      await page.locator("#main h1:visible").first().waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: true });
    }
    await context.close();
  } finally {
    await deleteAdminPagesUsers(users);
  }
});

const PACKS = ["mist", "fruity", "cat", "wizard", "dracula", "sunny", "starry"] as const;

// The Night Market kit (PIN-160) in every theme pack, light and dark, English and Hebrew: 28 pictures of the page
// at /admin/kit, plus the phone width in Mist.
test("kit, every theme pack", async ({ browser }) => {
  test.setTimeout(900_000);
  const users = await createAdminPagesUsers();
  try {
    for (const viewport of ["desktop", "phone"] as const) {
      const context = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        viewport: VIEWPORTS[viewport],
        deviceScaleFactor: viewport === "desktop" ? 1 : 2,
      });
      const page = await context.newPage();
      await page.goto("/app/auth?mode=signin");
      await signInWithPassword(page, users.admin.email, users.admin.password);
      await page.locator("#main").waitFor();
      for (const pack of viewport === "desktop" ? PACKS : (["mist"] as const)) {
        for (const scheme of ["light", "dark"] as const) {
          for (const language of ["en", "he"] as const) {
            // The account's choices win over this browser's once loaded (PIN-154), so both are set.
            await writeAccountPrefs({ locale: language, prefs: { scheme, pack, measurement: "original" } }, users.admin.email, users.admin.password);
            await page.evaluate(
              ([l, s, p]) => {
                localStorage.setItem("pinch:appLanguage", l);
                localStorage.setItem("pinch.themePreference", s);
                localStorage.setItem("pinch.themePack", p);
              },
              [language, scheme, pack],
            );
            await page.goto("/app/admin/kit");
            await page.locator("#main h1:visible").first().waitFor();
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${OUT}/kit-${viewport}-${pack}-${scheme}-${language}.png`, fullPage: true });
          }
        }
      }
      await context.close();
    }
  } finally {
    await deleteAdminPagesUsers(users);
  }
});

// Every theme pack on the main screens, in light and dark (PIN-164). Languages and widths alternate, so each pack is
// seen in English and Hebrew and at desktop, tablet and phone width without photographing every combination; Mist
// has every combination in the tests above.
test("every theme pack on the main screens", async ({ browser }) => {
  test.setTimeout(1_200_000);
  const [pasta] = await resetLibrary([{ ...RECIPE, createdSecondsAgo: 1 }, ...LIBRARY.map((recipe, index) => ({ ...recipe, createdSecondsAgo: index + 2 }))]);
  await resetShoppingList([{ name: "eggs", checked: true }, { name: "crushed tomatoes" }, { name: "feta" }, { name: "parsley" }, { name: "pita" }]);
  await resetHub([
    { name: "Crispy smashed potatoes", platform: "tiktok", save_count: 41, tags: ["dinner"] },
    { name: "Miso ramen", platform: "youtube", save_count: 22, tags: ["soup"] },
    { name: "Lemon olive oil cake", platform: "instagram", save_count: 9, tags: ["dessert"] },
  ]);
  const screens = [
    ["library", "/app"],
    ["recipe", `/app/recipe/${pasta}`],
    ["snap", "/app/add"],
    ["hub", "/app/hub"],
    ["list", "/app/list"],
    ["appearance", "/app/settings/appearance"],
    ["credits", "/app/settings/credits"],
    ["cookbook", "/app/cookbook"],
  ] as const;
  const widths = ["desktop", "tablet", "phone"] as const;
  let group = 0;
  for (const pack of PACKS) {
    for (const scheme of ["light", "dark"] as const) {
      group += 1;
      for (const [index, [name, path]] of screens.entries()) {
        // Shifted by one for each pack and scheme, so a screen isn't always in the same language or width.
        const language = (index + group) % 2 === 0 ? "en" : "he";
        const viewport = widths[(index + group) % 3];
        const { page, context } = await open(browser, viewport, { language, scheme, pack }, path);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/packs-${name}-${pack}-${scheme}-${viewport}-${language}.png`, fullPage: true });
        await context.close();
      }
    }
  }
});

test("emails setting, and the unsubscribe page from an email link", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const [language, scheme] of [["en", "light"], ["he", "light"], ["en", "dark"]] as const) {
      if (viewport === "tablet" && scheme === "dark") continue;
      const { page, context } = await open(browser, viewport, { language, scheme }, "/app/settings/emails");
      await page.getByRole("switch").waitFor();
      await page.screenshot({ path: `${OUT}/settings-emails-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await context.close();

      // A guest opens the link. The function's answer is stubbed: this is about the page.
      const guest = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        viewport: VIEWPORTS[viewport],
        deviceScaleFactor: viewport === "desktop" ? 1 : 2,
        colorScheme: scheme,
      });
      await guest.addInitScript((p: Prefs) => {
        localStorage.setItem("pinch:appLanguage", p.language);
        localStorage.setItem("pinch.themePreference", p.scheme);
      }, { language, scheme });
      const guestPage = await guest.newPage();
      await guestPage.route("**/functions/v1/email-preferences", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", opt_out: true }) }),
      );
      const link = `u=10000000-0000-4000-8000-00000000aa01&t=${"a".repeat(64)}&l=${language}`;
      await guestPage.goto(`/app/unsubscribe?${link}`);
      await guestPage.getByRole("status").waitFor();
      await guestPage.waitForTimeout(300);
      await guestPage.screenshot({ path: `${OUT}/unsubscribe-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await guestPage.goto("/app/unsubscribe");
      await guestPage.getByRole("status").waitFor();
      await guestPage.screenshot({ path: `${OUT}/unsubscribe-invalid-${viewport}-${language}-${scheme}.png`, fullPage: true });
      await guest.close();
    }
  }
});

test("household: settings, invite, join page and the shared list", async ({ browser }) => {
  test.setTimeout(600_000);
  const baseURL = test.info().project.use.baseURL;
  for (const language of ["en", "he"] as const) {
    const he = language === "he";
    // Fresh accounts in the screenshot's language: households stay out of the shared test account.
    const alone = await newAccount("e2e-shot-alone", language);
    const dana = await newAccount("e2e-shot-dana", language);
    const avi = await newAccount("e2e-shot-avi", language);
    const noa = await newAccount("e2e-shot-noa", language);
    const token = await householdOf(he ? "משפחת כהן" : "The Cohens", [
      { account: dana, displayName: he ? "דנה" : "Dana" },
      { account: avi, displayName: he ? "אבי" : "Avi" },
      { account: noa, displayName: he ? "נועה" : "Noa" },
    ]);
    // Pictures as real people would have them (Noa keeps her initial), so the avatars show as they will.
    await setFoodAvatar(dana, "avocado");
    await setFoodAvatar(avi, "pizza");
    await addListItemsAs(dana, he ? ["בצל", "חלב"] : ["onion", "milk"]);
    await addListItemsAs(avi, he ? ["לחם", "שמן זית"] : ["bread", "olive oil"]);

    // Sign each account in once; every screenshot reuses its session.
    const sessions = new Map<Account, Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>>();
    for (const account of [alone, dana]) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/app/auth?mode=signin");
      await signInWithPassword(page, account.email, account.password);
      await page.locator("#main").waitFor();
      sessions.set(account, await context.storageState());
      await context.close();
    }

    for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
      for (const scheme of ["light", "dark"] as const) {
        const tag = `${viewport}-${language}-${scheme}`;
        const as = async (account: Account | null, path: string) => {
          // The account's saved choices win over the browser's (PIN-154), so the theme goes on the account too.
          if (account) await writeAccountPrefs({ locale: language, prefs: { scheme, pack: "mist", measurement: "original" } }, account.email, account.password);
          const context = await browser.newContext({
            baseURL,
            viewport: VIEWPORTS[viewport],
            deviceScaleFactor: viewport === "desktop" ? 1 : 2,
            storageState: account ? sessions.get(account) : undefined,
            colorScheme: scheme,
          });
          await context.addInitScript((p: Prefs) => {
            localStorage.setItem("pinch:appLanguage", p.language);
            localStorage.setItem("pinch.themePreference", p.scheme);
            localStorage.setItem("pinch.themePack", "mist");
          }, { language, scheme });
          const page = await context.newPage();
          await page.goto(path);
          await page.locator("#main h1:visible").waitFor();
          await page.waitForTimeout(400);
          return { page, context };
        };

        let shot = await as(alone, "/app/settings/household");
        await shot.page.getByRole("radiogroup").waitFor();
        await shot.page.screenshot({ path: `${OUT}/household-setup-${tag}.png`, fullPage: true });
        await shot.context.close();

        shot = await as(dana, "/app/settings/household");
        // One remove button per screen size is shown; wait for the visible one.
        await shot.page.locator("[data-track='household.member.remove']:visible").first().waitFor();
        await shot.page.screenshot({ path: `${OUT}/household-members-${tag}.png`, fullPage: true });
        await shot.page.locator("[data-track='household.invite']").click();
        await shot.page.locator("#household-invite-link").waitFor();
        await shot.page.waitForTimeout(300);
        await shot.page.screenshot({ path: `${OUT}/household-invite-${tag}.png` });
        await shot.context.close();

        shot = await as(dana, "/app/list");
        await shot.page.locator("[data-testid='added-by']").first().waitFor();
        await shot.page.screenshot({ path: `${OUT}/household-list-${tag}.png`, fullPage: true });
        await shot.context.close();

        shot = await as(null, `/app/join/${token}`);
        await shot.page.locator("[data-track='household.join.sign_up']").waitFor();
        await shot.page.screenshot({ path: `${OUT}/household-join-guest-${tag}.png`, fullPage: true });
        await shot.context.close();

        shot = await as(alone, `/app/join/${token}`);
        await shot.page.locator("[data-track='household.join.join']").waitFor();
        await shot.page.screenshot({ path: `${OUT}/household-join-${tag}.png`, fullPage: true });
        await shot.context.close();
      }
    }
  }
});

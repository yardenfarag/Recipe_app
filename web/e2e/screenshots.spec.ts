import { test, type Browser } from "@playwright/test";

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

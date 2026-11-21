import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { signInWithPassword } from "./helpers";
import { importedRecipe, PHOTO_PNG, SOURCE_LINKS, stubImports } from "./snapSeed";
import { TEST_USER } from "./testUser";
import { writeAccountPrefs } from "./prefsSeed";

// Every import here is answered by a stub (snapSeed.ts): a real one spends credits and calls paid models.

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function openSnap(page: Page) {
  await page.goto("/app/auth?mode=signin&next=%2Fadd");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.getByRole("heading", { level: 1, name: "Snap a recipe" })).toBeVisible();
  await expect(page).toHaveTitle("Snap · Pinch");
}

const linkField = (page: Page) => page.getByLabel("Recipe URL");
const snapButton = (page: Page) => page.getByRole("button", { name: "Snap", exact: true });

test("a link from each supported source imports, previews and saves", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubImports(page, {
    "extract-recipe": SOURCE_LINKS.map(({ platform, url }) => ({
      body: { status: "full", platform, recipe: importedRecipe(`Pasta from ${platform}`, { platform, original_url: url }) },
    })),
  });
  await openSnap(page);

  for (const { platform, url } of SOURCE_LINKS) {
    await page.goto("/app/add");
    await linkField(page).fill(url);
    await snapButton(page).click();
    await expect(page).toHaveURL(/\/app\/recipe\/preview$/);
    await expect(page.locator("#main h1")).toHaveText(`Pasta from ${platform}`);
    await expect(page.getByRole("region", { name: "Ingredients" })).toContainText("spaghetti");
    // Not saved yet: no heart.
    await expect(page.getByRole("button", { name: /favorites/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("In your kitchen")).toBeVisible();
    await expect(page.getByRole("link", { name: `Pasta from ${platform}` })).toBeVisible();
  }

  // Each call carried its link and an idempotency key, and no guest id (the web needs an account).
  expect(calls.map((call) => call.body.url)).toEqual(SOURCE_LINKS.map((source) => source.url));
  for (const call of calls) {
    expect(typeof call.body.request_id).toBe("string");
    expect(call.body.guest_install_id).toBeUndefined();
  }
});

test("a photo chosen from the computer imports and saves", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubImports(page, {
    "extract-recipe": { body: { status: "full", platform: "photo", recipe: importedRecipe("Grandma's Cake", { platform: "photo", extraction_source: "photo" }) } },
  });
  await openSnap(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PHOTO_PNG });
  await expect(page.locator("#main h1")).toHaveText("Grandma's Cake");
  expect(calls[0].body.image_mime).toBe("image/jpeg");
  expect(String(calls[0].body.image_base64).length).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("link", { name: "Grandma's Cake" })).toBeVisible();
});

test("a photo dropped onto the page imports", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubImports(page, {
    "extract-recipe": { body: { status: "full", platform: "photo", recipe: importedRecipe("Dropped Soup", { platform: "photo" }) } },
  });
  await openSnap(page);
  const data = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "soup.png", { type: "image/png" }));
    return transfer;
  }, PHOTO_PNG.toString("base64"));
  await page.dispatchEvent("#main", "dragenter", { dataTransfer: data });
  await page.dispatchEvent("#main", "drop", { dataTransfer: data });
  await expect(page.locator("#main h1")).toHaveText("Dropped Soup");
  expect(calls).toHaveLength(1);
});

test("a link pasted anywhere on the page lands in the link field", async ({ page }) => {
  await resetLibrary([]);
  await stubImports(page, {});
  await openSnap(page);
  await page.evaluate((url) => {
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    event.clipboardData?.setData("text/plain", `Try this: ${url}`);
    document.body.dispatchEvent(event);
  }, SOURCE_LINKS[0].url);
  await expect(linkField(page)).toHaveValue(SOURCE_LINKS[0].url);
  await expect(linkField(page)).toBeFocused();
});

test("Guess the recipe guesses from a food link", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubImports(page, {
    "invent-recipe": {
      body: { status: "full", platform: "instagram", recipe: importedRecipe("Guessed Ramen", { extraction_source: "invented", original_url: SOURCE_LINKS[1].url }) },
    },
  });
  await openSnap(page);
  // The radio itself is visually hidden inside its label, so click the label, as a person does.
  await page.locator("label").filter({ has: page.getByRole("radio", { name: "Guess the recipe" }) }).click();
  await expect(page.getByRole("radio", { name: "Guess the recipe" })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1, name: "Guess the recipe" })).toBeVisible();
  await page.getByLabel("Food link").fill(SOURCE_LINKS[1].url);
  await page.getByRole("button", { name: "Guess the recipe", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Guessed Ramen");
  await expect(page.getByText("Guessed", { exact: true }).first()).toBeVisible();
  expect(calls[0]).toMatchObject({ fn: "invent-recipe", body: { url: SOURCE_LINKS[1].url, language: "en" } });
});

test("a dish without a written recipe offers Guess the recipe", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubImports(page, {
    "extract-recipe": { body: { status: "failed", platform: "tiktok", code: "looks_like_dish", dish_guess: "pad thai" } },
    "invent-recipe": { body: { status: "full", platform: "tiktok", recipe: importedRecipe("Pad Thai", { extraction_source: "invented" }) } },
  });
  await openSnap(page);
  await linkField(page).fill(SOURCE_LINKS[2].url);
  await snapButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Guess the recipe?" });
  await expect(dialog).toContainText("This looks like pad thai");
  await expect(dialog.getByRole("button", { name: "Extract anyway" })).toBeVisible();
  await dialog.getByRole("button", { name: "Guess the recipe" }).click();
  await expect(page.locator("#main h1")).toHaveText("Pad Thai");
  expect(calls[1]).toMatchObject({ fn: "invent-recipe", body: { already_gated: true } });
});

test("failures say what the mobile app says, and nothing opens", async ({ page }) => {
  await resetLibrary([]);
  await stubImports(page, {
    "extract-recipe": [
      { body: { status: "failed", platform: "web", code: "not_food" } },
      { status: 402, body: { status: "failed", platform: "web", code: "insufficient_credits", message: "No credits" } },
      { body: { status: "partial", platform: "web", recipe: importedRecipe("Half Soup", { instructions: [], extraction_status: "partial" }) } },
      { body: { status: "failed", platform: "web", message: "Couldn’t find a recipe on that page." } },
      // No answer (a gateway timeout): friendly words, never the client library's text.
      { status: 504, body: {} },
    ],
  });
  await openSnap(page);
  const url = SOURCE_LINKS[4].url;

  await linkField(page).fill(url);
  await snapButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "That doesn’t look like food or a recipe." })).toBeVisible();

  await linkField(page).fill(url);
  await snapButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "You’ve used all 10 free recipe credits this month." })).toBeVisible();
  // Buying opens the out-of-credits prompt right on Snap.
  await page.getByRole("status").getByRole("button", { name: "Buy credits" }).click();
  await expect(page.getByRole("dialog", { name: "You’re out of credits" })).toBeVisible();
  await page.keyboard.press("Escape");

  await linkField(page).fill(url);
  await snapButton(page).click();
  await expect(page.getByText("We couldn’t find the whole recipe")).toBeVisible();

  await linkField(page).fill(url);
  await snapButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t find a recipe on that page." })).toBeVisible();

  await linkField(page).fill(url);
  await snapButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong. Please try again." })).toBeVisible();
  await expect(page.getByText(/Edge Function/)).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/add$/);
});

test("a link that is already saved opens the saved recipe, without importing", async ({ page }) => {
  const [id] = await resetLibrary([{ title: "Saved Pasta", original_url: SOURCE_LINKS[4].url }]);
  const calls = await stubImports(page, {});
  await openSnap(page);
  await linkField(page).fill(SOURCE_LINKS[4].url);
  await expect(page.getByText("This link was already in your library.")).toBeVisible();
  await snapButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/app/recipe/${id}$`));
  await expect(page.locator("#main h1")).toHaveText("Saved Pasta");
  expect(calls).toHaveLength(0);
});

test("Discard drops the preview and goes back to Snap", async ({ page }) => {
  await resetLibrary([]);
  await stubImports(page, { "extract-recipe": { body: { status: "full", platform: "web", recipe: importedRecipe("Unwanted Stew") } } });
  await openSnap(page);
  await linkField(page).fill(SOURCE_LINKS[4].url);
  await snapButton(page).click();
  await expect(page.locator("#main h1")).toHaveText("Unwanted Stew");
  // A reload keeps the paid import.
  await page.reload();
  await expect(page.locator("#main h1")).toHaveText("Unwanted Stew");
  await page.getByRole("button", { name: /Discard|web\.snap\.discard/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Discard|web\.snap\.discard/ }).click();
  await expect(page).toHaveURL(/\/app\/add$/);
  await page.goto("/app/recipe/preview");
  await expect(page.getByText("Nothing to preview yet. Snap a recipe first.")).toBeVisible();
});

test.describe("phone, in Hebrew", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("reads right to left and nothing runs off the side", async ({ page }) => {
    await resetLibrary([]);
    await stubImports(page, {});
    await openSnap(page);
    await writeAccountPrefs({ locale: "he" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "שליפת מתכון" })).toBeVisible();
    await expect(page.getByLabel("קישור למתכון")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await writeAccountPrefs({ locale: "en" });
  });
});

import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { resetShoppingList, readShoppingList } from "./listSeed";
import { PHOTO, PHOTOS, readPantry, resetPantry, stubScanPantry } from "./pantrySeed";
import { TEST_USER } from "./testUser";

/** PIN-181: the pantry page, a scan from photos (with the model stubbed), and What can I cook. */

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetPantry([]);
  await resetTestUserLanguage();
});

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
}

test("an empty pantry invites a scan, and items typed by hand save and come off again", async ({ page }) => {
  await resetPantry([]);
  await signIn(page);
  await page.goto("/app/settings/pantry");
  await expect(page.locator("#main h1:visible")).toHaveText("Pantry");
  await expect(page.getByRole("heading", { name: "Your pantry is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Scan my kitchen" })).toBeVisible();

  // Items typed into a place show at once and are saved.
  await resetPantry([{ name: "Milk", place: "fridge", aisle: "dairy" }]);
  await page.reload();
  const freezer = page.getByRole("region", { name: "Freezer" });
  await freezer.getByRole("button", { name: "Add an item" }).click();
  await freezer.getByRole("textbox").fill("Frozen peas");
  await freezer.getByRole("button", { name: "Add to Freezer" }).click();
  await expect(freezer.getByText("Frozen peas")).toBeVisible();
  await expect.poll(async () => (await readPantry()).map((row) => `${row.place}:${row.name}:${row.source}`)).toContain("freezer:Frozen peas:manual");

  // Removing one offers Undo.
  await page.getByRole("region", { name: "Fridge" }).getByRole("button", { name: "Remove Milk" }).click();
  await expect(page.getByText("Removed Milk")).toBeVisible();
  await expect.poll(async () => (await readPantry()).some((row) => row.name === "Milk")).toBe(false);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await readPantry()).some((row) => row.name === "Milk")).toBe(true);
});

test("a scan reads each photo as it's added, then saves the checked list", async ({ page }) => {
  await resetPantry([{ name: "Butter", place: "fridge", aisle: "dairy" }]);
  await signIn(page);
  await stubScanPantry(page, [
    { items: [{ name: "Milk", aisle: "dairy", brand: "Tnuva" }, { name: "Eggs", aisle: "dairy" }, { name: "Tub of leftovers", confidence: "low", container_unknown: true }] },
    { quality: "too_dark", items: [{ name: "Tahini", aisle: "pantry", confidence: "low" }] },
  ]);
  await page.goto("/app/pantry/scan?place=fridge");
  await expect(page.locator("#main h1:visible")).toHaveText("Scan your kitchen");
  await expect(page.getByRole("radio", { name: /Fridge/ })).toHaveAttribute("aria-checked", "true");

  await page.locator('#main input[type="file"]').first().setInputFiles([PHOTOS[0], PHOTOS[1]]);
  const photos = page.locator("#main ul[aria-live]");
  await expect(photos.getByText("3 items", { exact: true })).toBeVisible();
  await expect(photos.getByText("Too dark · 1 item")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Fridge/ })).toContainText("2 photos · 4 items");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();

  // The next step sits right under the photos: what was found, and the one button that moves on.
  await expect(page.getByRole("heading", { name: "4 items found" })).toBeVisible();
  await page.getByRole("button", { name: "Check the list" }).first().click();
  await expect(page.locator("#main h1:visible")).toHaveText("Check the list");
  await expect(page.getByRole("listitem").filter({ hasText: "Check and save" })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText(/Pinch can miss things or get them wrong/)).toBeVisible();
  const unsure = page.getByRole("region", { name: "Not sure about these" });
  await expect(unsure.getByRole("checkbox", { name: /Tahini/ })).toHaveAttribute("aria-checked", "false");
  await unsure.getByRole("checkbox", { name: /Tahini/ }).click();
  // Butter was saved but isn't in these photos: asked about, never removed unless ticked.
  await expect(page.getByRole("region", { name: "Not in these photos" }).getByRole("checkbox", { name: /Butter/ })).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Save 3 items" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/pantry$/);
  await expect
    .poll(async () => (await readPantry()).map((row) => row.name).sort())
    .toEqual(["Butter", "Eggs", "Milk", "Tahini"]);
});

test("the same photo picked twice is read once", async ({ page }) => {
  await resetPantry([]);
  await signIn(page);
  let reads = 0;
  await page.route("**/functions/v1/scan-pantry", async (route) => {
    reads += 1;
    await route.fulfill({
      json: { status: "ok", photo: { id: "00000000-0000-4000-8000-000000000009", scan_id: "s", place: "fridge", quality: "ok", truncated: false, from_phone: false, created_at: new Date().toISOString(), items: [{ name: "Milk", name_en: "milk", brand: "", aisle: "dairy", confidence: "high", container_unknown: false }] } },
    });
  });
  await page.goto("/app/pantry/scan?place=fridge");
  await page.locator('#main input[type="file"]').first().setInputFiles([PHOTO, { ...PHOTO, name: "again.png" }]);
  await expect(page.getByText("Looks like a photo you already added, so it was skipped.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 item found" })).toBeVisible();
  expect(reads).toBe(1);
  await expect(page.getByRole("button", { name: "Add anyway" })).toBeVisible();
});

test("the phone page opens a link and sends photos without signing in", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/functions/v1/photo-handoff", async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "open") await route.fulfill({ json: { status: "ok", purpose: "pantry", place: "cupboard", language: "en", expires_at: new Date(Date.now() + 600_000).toISOString() } });
    else
      await route.fulfill({
        json: {
          status: "ok",
          photo: { id: null, scan_id: "s", place: "cupboard", quality: "ok", truncated: false, from_phone: true, created_at: new Date().toISOString(), items: [{ name: "Rice", name_en: "rice", brand: "", aisle: "pantry", confidence: "high", container_unknown: false }] },
        },
      });
  });
  await page.goto("/app/phone#abcdefghijklmnopqrstuvwxyz012345");
  await expect(page.getByRole("heading", { name: "Send photos to Pinch" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Cupboards" })).toHaveAttribute("aria-checked", "true");
  await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
  await expect(page.getByText("1 item")).toBeVisible();
  // Several at once from the photo library.
  await expect(page.locator('input[type="file"][multiple]')).toHaveCount(1);
  // "I'm done" ends it, and says what to do next.
  await page.getByRole("button", { name: "I’m done" }).click();
  await expect(page.getByRole("heading", { name: "All done" })).toBeVisible();
  await expect(page.getByText("Your photos are on your computer. Close this page and carry on there.")).toBeVisible();
  await context.close();
});

test("a link that ran out says so on the phone", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/app/phone#abcdefghijklmnopqrstuvwxyz012345");
  await expect(page.locator("#main").getByRole("alert")).toHaveText("This link has expired. Make a new one on your computer.");
  await context.close();
});

const CREPES: SeedRecipe = {
  title: "Crepes",
  servings: 2,
  ingredients: [
    { name: "eggs", quantity: 2, unit: "" },
    { name: "milk", quantity: 1, unit: "cup" },
    { name: "flour", quantity: 1, unit: "cup" },
    { name: "vanilla", quantity: 1, unit: "tsp" },
  ],
};

test("What can I cook ranks the Library by what's at home and puts what's missing on the list", async ({ page }) => {
  await resetLibrary([CREPES]);
  await resetShoppingList([]);
  await resetPantry([
    { name: "Eggs", place: "fridge", aisle: "dairy" },
    { name: "Milk", place: "fridge", aisle: "dairy" },
    { name: "Flour", place: "cupboard", aisle: "pantry" },
  ]);
  await signIn(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "What can I cook?" }).click();
  const dialog = page.getByRole("dialog", { name: "What can I cook?" });
  await expect(dialog.getByText("Crepes")).toBeVisible();
  await expect(dialog.getByText("3 of 4 at home")).toBeVisible();
  await expect(dialog.getByText("Missing: vanilla")).toBeVisible();
  await dialog.getByRole("button", { name: "Add missing to list" }).click();
  await expect.poll(async () => (await readShoppingList()).map((row) => row.name)).toEqual(["vanilla"]);
  await resetLibrary([]);
});

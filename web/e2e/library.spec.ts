import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { localSupabase } from "./env.mjs";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

const THREE: SeedRecipe[] = [
  { title: "Lemon Pasta", is_favorite: true, estimated_time_minutes: 25, effort_level: "Easy", tags: ["pasta"], createdSecondsAgo: 1 },
  { title: "Chocolate Cake", estimated_time_minutes: 90, effort_level: "Hard", tags: ["dessert"], createdSecondsAgo: 2 },
  { title: "Green Salad", estimated_time_minutes: 10, effort_level: "Easy", tags: ["salad"], createdSecondsAgo: 3 },
];

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function openLibrary(page: Page, recipes: SeedRecipe[] = THREE, path = "/app") {
  const ids = await resetLibrary(recipes);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
  if (path !== "/app") await page.goto(path);
  return ids;
}

const cards = (page: Page) => page.locator("#main article:visible");
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });

test("shows every recipe, newest first, with time and effort", async ({ page }) => {
  await openLibrary(page);
  await expect(page.locator("#main h1:visible")).toHaveText("Your recipes");
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).first()).toContainText("Lemon Pasta");
  await expect(card(page, "Lemon Pasta")).toContainText("25 min · Easy");
  await expect(page.getByText("3 recipes", { exact: true })).toBeVisible();
});

test("search narrows the list, '/' jumps to it, and opening a recipe goes to its page", async ({ page }) => {
  await openLibrary(page);
  await page.locator("#main h1:visible").click();
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Snap a recipe or search yours" });
  await expect(search).toBeFocused();

  await search.fill("pasta");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Lemon Pasta");
  await expect(page).toHaveURL(/\?q=pasta$/);

  await page.getByRole("link", { name: "Lemon Pasta" }).click();
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main h1:visible")).toHaveText("Lemon Pasta");

  // Back returns to the same search.
  await page.goBack();
  await expect(page.getByRole("searchbox", { name: "Snap a recipe or search yours" })).toHaveValue("pasta");
  await expect(cards(page)).toHaveCount(1);
});

test("no matches says so and can clear the filters", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("searchbox", { name: "Snap a recipe or search yours" }).fill("zzzz");
  await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(3);
});

test("favorites: the heart saves, and the Favorites filter shows only hearted recipes", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Add Green Salad to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove Green Salad from favorites" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Green Salad from favorites" })).toBeVisible();

  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(card(page, "Chocolate Cake")).toHaveCount(0);
});

test("cook tonight keeps quick, easy recipes", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Cook tonight" }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(card(page, "Chocolate Cake")).toHaveCount(0);
});

test("sort and tags live in the filter panel", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("radio", { name: "A–Z" }).click();
  await expect(cards(page).first()).toContainText("Chocolate Cake");
  await page.getByRole("button", { name: /^salad$/i }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Green Salad");
});

test("collections: create, add a recipe, filter by it, rename, delete", async ({ page }) => {
  await openLibrary(page);
  const group = page.getByRole("group", { name: "Collections" });

  await group.getByRole("button", { name: "New collection" }).click();
  const create = page.getByRole("dialog", { name: "New collection" });
  await create.getByLabel("Collection name").fill("Weeknight");
  await create.getByRole("button", { name: "New", exact: true }).click();
  await expect(group.getByRole("button", { name: "Weeknight", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("0 recipes", { exact: true })).toBeVisible();

  await group.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Actions for Green Salad" }).click();
  await page.getByRole("menuitem", { name: "Add to collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Add to collection" });
  await dialog.getByRole("checkbox", { name: /Weeknight/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  await group.getByRole("button", { name: "Weeknight", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Green Salad");

  await page.getByRole("button", { name: "Manage Weeknight" }).click();
  await page.getByRole("menuitem", { name: "Rename collection" }).click();
  const rename = page.getByRole("dialog", { name: "Rename collection" });
  await rename.getByLabel("Collection name").fill("Quick dinners");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(group.getByRole("button", { name: "Quick dinners", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Manage Quick dinners" }).click();
  await page.getByRole("menuitem", { name: "Delete collection" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete collection" }).click();
  await expect(group.getByRole("button", { name: "Quick dinners", exact: true })).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
});

test("a duplicate collection name is refused", async ({ page }) => {
  await openLibrary(page);
  const group = page.getByRole("group", { name: "Collections" });

  await group.getByRole("button", { name: "New collection" }).click();
  let dialog = page.getByRole("dialog", { name: "New collection" });
  await dialog.getByLabel("Collection name").fill("Soups");
  await dialog.getByRole("button", { name: "New", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await group.getByRole("button", { name: "New collection" }).click();
  dialog = page.getByRole("dialog", { name: "New collection" });
  await dialog.getByLabel("Collection name").fill("soups");
  await dialog.getByRole("button", { name: "New", exact: true }).click();
  await expect(dialog.getByText("You already have a collection with that name.")).toBeVisible();
});

test("rename and delete a recipe from its menu", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Actions for Green Salad" }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename recipe" });
  await rename.getByLabel("Recipe name").fill("Crunchy Salad");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(card(page, "Crunchy Salad")).toHaveCount(1);

  await page.getByRole("button", { name: "Actions for Crunchy Salad" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete this recipe?" }).getByRole("button", { name: "Delete" }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(card(page, "Crunchy Salad")).toHaveCount(0);
});

test("the grid or list choice is remembered", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("radio", { name: "Show as list" }).click();
  await expect(page.getByRole("radio", { name: "Show as list" })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Show as list" })).toBeChecked();
  await page.getByRole("radio", { name: "Show as grid" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Show as grid" })).toBeChecked();
});

test("an empty library offers Snap", async ({ page }) => {
  await openLibrary(page, []);
  await expect(page.getByRole("heading", { name: "Save your first recipe" })).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: "Snap a recipe" })).toHaveAttribute("href", "/app/add");
});

test("a library of hundreds loads as you scroll, and searching finds one past the first page", async ({ page }) => {
  const many: SeedRecipe[] = Array.from({ length: 300 }, (_, index) => ({
    title: index === 250 ? "Needle Noodles" : `Recipe number ${index}`,
    createdSecondsAgo: index + 1,
  }));
  await openLibrary(page, many);
  await expect(page.getByText("300 recipes", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(40);

  await page.mouse.wheel(0, 100_000);
  await expect.poll(() => cards(page).count()).toBeGreaterThan(40);

  // The 251st recipe isn't loaded yet on a fresh page, but search looks at the whole library.
  await page.reload();
  await expect(cards(page)).toHaveCount(40);
  await page.getByRole("searchbox", { name: "Snap a recipe or search yours" }).fill("needle");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Needle Noodles");
});

test("the address keeps the filters: a linked search opens already filtered", async ({ page }) => {
  await openLibrary(page, THREE, "/app?q=cake");
  await expect(page.getByRole("searchbox", { name: "Snap a recipe or search yours" })).toHaveValue("cake");
  await expect(cards(page)).toHaveCount(1);
});

/** A change made outside this tab (the phone app, say): renames a recipe straight in the database. */
async function renameElsewhere(id: string, title: string) {
  const { url, serviceRoleKey } = localSupabase();
  const response = await fetch(`${url}/rest/v1/recipes?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error(`Could not rename the recipe (${response.status}): ${await response.text()}`);
}

/** The recipe list answers slowly from now on, so anything on screen at once came from memory. */
async function slowRecipeList(page: Page) {
  await page.route(/\/rest\/v1\/recipes\?/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
}

test.describe("coming back (PIN-174)", () => {
  test("from another section, the recipes are there at once, then what changed meanwhile", async ({ page }) => {
    const ids = await openLibrary(page);
    await expect(cards(page)).toHaveCount(3);
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    // The Hub is a tab of the Library (PIN-77).
    await page.getByRole("navigation", { name: "Library sections" }).getByRole("link", { name: "Hub" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cooking Hub");

    // Renamed on another device while the Hub was open.
    await renameElsewhere(ids[2], "Green Salad with Feta");
    await slowRecipeList(page);
    await nav.getByRole("link", { name: "Library", exact: true }).click();

    // Well before the slowed list could answer: last time's recipes, no loading outlines.
    await expect(cards(page)).toHaveCount(3, { timeout: 1_000 });
    await expect(page.locator("#main [aria-busy=true]")).toHaveCount(0);
    // Then the quiet refresh brings the change.
    await expect(card(page, "Green Salad with Feta")).toBeVisible({ timeout: 10_000 });
    await expect(cards(page)).toHaveCount(3);
  });

  test("a heart given on the recipe's page shows at once back in the Library", async ({ page }) => {
    await openLibrary(page);
    await page.getByRole("link", { name: "Chocolate Cake" }).click();
    await expect(page.locator("#main h1:visible")).toHaveText("Chocolate Cake");
    await page.getByRole("button", { name: "Add Chocolate Cake to favorites" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("button", { name: "Remove Chocolate Cake from favorites" }).filter({ visible: true }).first()).toBeVisible();

    await slowRecipeList(page);
    await page.goBack();
    await expect(page.getByRole("button", { name: "Remove Chocolate Cake from favorites" })).toBeVisible({ timeout: 1_000 });
  });

  test("Back from a recipe returns to the same place in a long list, at once", async ({ page }) => {
    const many: SeedRecipe[] = Array.from({ length: 60 }, (_, index) => ({
      title: `Stew number ${String(index + 1).padStart(2, "0")}`,
      createdSecondsAgo: index + 1,
    }));
    await openLibrary(page, many);
    await expect(cards(page)).toHaveCount(40);
    const target = card(page, "Stew number 30");
    await target.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);

    await page.getByRole("link", { name: "Stew number 30" }).click();
    await expect(page.locator("#main h1:visible")).toHaveText("Stew number 30");
    await slowRecipeList(page);
    await page.goBack();

    await expect(target).toBeInViewport({ timeout: 1_000 });
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(5);
  });
});

test.describe("kept alive between sections (PIN-175)", () => {
  const STEWS: SeedRecipe[] = Array.from({ length: 60 }, (_, index) => ({
    title: `Stew number ${String(index + 1).padStart(2, "0")}`,
    tags: index === 0 ? ["soup"] : [],
    createdSecondsAgo: index + 1,
  }));
  const nav = (page: Page) => page.getByRole("navigation", { name: "Main" }).filter({ visible: true });

  test("is not drawn again: the same page comes back", async ({ page }) => {
    await openLibrary(page);
    await page.locator("#library-heading").evaluate((heading) => heading.setAttribute("data-kept", "yes"));
    await nav(page).getByRole("link", { name: "List" }).click();
    await expect(page.locator("#main h1:visible")).not.toHaveText("Your recipes");
    await nav(page).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.locator("#library-heading")).toHaveAttribute("data-kept", "yes");
    await expect(page).toHaveTitle("Library · Pinch");
  });

  test("a link back keeps the search and the place, as Back does", async ({ page }) => {
    await openLibrary(page, STEWS);
    await page.getByRole("searchbox", { name: "Snap a recipe or search yours" }).fill("stew");
    await expect(page).toHaveURL(/\/app\?q=stew$/);
    const target = card(page, "Stew number 30");
    await target.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);

    await nav(page).getByRole("link", { name: "List" }).click();
    await expect(page.locator("#main h1:visible")).not.toHaveText("Your recipes");
    await slowRecipeList(page);
    await nav(page).getByRole("link", { name: "Library", exact: true }).click();

    await expect(page).toHaveURL(/\/app\?q=stew$/);
    await expect(page.getByRole("searchbox", { name: "Snap a recipe or search yours" })).toHaveValue("stew");
    await expect(target).toBeInViewport({ timeout: 1_000 });
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(5);
  });

  test("a link that asks for a filter gets it, from the top", async ({ page }) => {
    await openLibrary(page, STEWS);
    await card(page, "Stew number 30").scrollIntoViewIfNeeded();
    await page.getByRole("link", { name: "Stew number 01" }).click();
    await expect(page.locator("#main h1:visible")).toHaveText("Stew number 01");
    await page.locator("#main").getByRole("link", { name: "Soup", exact: true }).first().click();

    await expect(page).toHaveURL(/\/app\?tag=soup$/);
    await expect(cards(page).filter({ visible: true })).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(5);
  });

  test("hidden, it leaves the other sections alone: one heading, and keys go to the page on screen", async ({ page }) => {
    await openLibrary(page);
    await nav(page).getByRole("link", { name: "List" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // "/" jumps to the Library's search only while the Library shows.
    await page.locator("body").press("/");
    await expect(page.getByRole("searchbox", { name: "Snap a recipe or search yours" })).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("is photo cards two across, and every control fits the width", async ({ page }) => {
    await openLibrary(page);
    await expect(page.getByRole("radio", { name: "Show as grid" })).toBeChecked();
    await expect(cards(page)).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

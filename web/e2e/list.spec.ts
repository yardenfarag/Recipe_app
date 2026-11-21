import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { addListItems, checkListItem, readPantryStaples, readShoppingList, resetShoppingList, setPantryStaples, type SeedItem } from "./listSeed";
import { TEST_USER } from "./testUser";
import { writeAccountPrefs } from "./prefsSeed";

const WEEK: SeedItem[] = [
  { name: "onion", quantity: 2, unit: null },
  { name: "milk", quantity: 1, unit: "l" },
  { name: "salt" },
];

const PANCAKES: SeedRecipe = {
  title: "Fluffy Pancakes",
  servings: 2,
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup", spoons: { quantity: 1, unit: "cup" } },
    { name: "milk", quantity: 1, unit: "l", spoons: { quantity: 1, unit: "l" } },
    { name: "salt", quantity: 1, unit: "tsp", spoons: { quantity: 1, unit: "tsp" } },
  ],
};

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
  await setPantryStaples([]);
});

async function openList(page: Page, items: SeedItem[] = WEEK) {
  await resetShoppingList(items);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto("/app/list");
  await expect(page.locator("#main h1")).toHaveText("List");
}

const item = (page: Page, name: string | RegExp) => page.getByRole("checkbox", { name: typeof name === "string" ? new RegExp(`^${name}(,|$)`) : name });
const addField = (page: Page) => page.getByRole("textbox", { name: "Item name" });
const group = (page: Page, name: string) => page.locator("#main section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${name}`) }) });

test("groups the list by aisle, with a count per group", async ({ page }) => {
  await openList(page, [...WEEK, { name: "garlic" }]);
  const headings = page.locator("#main section h2");
  await expect(headings).toHaveCount(3);
  await expect(headings.nth(0)).toContainText("Produce");
  await expect(headings.nth(0)).toContainText("2");
  await expect(headings.nth(1)).toContainText("Dairy & eggs");
  await expect(headings.nth(2)).toContainText("Spices");
  await expect(group(page, "Produce").getByRole("checkbox")).toHaveCount(2);
  await expect(item(page, "milk")).toHaveAccessibleName("milk, 1 L");
});

test("checking off with the mouse moves the item to Checked, and the phone sees it", async ({ page }) => {
  await openList(page);
  await item(page, "milk").click();
  await expect(item(page, "milk")).toHaveAttribute("aria-checked", "true");
  await expect(group(page, "Checked").getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByText("2 left · 1 checked")).toBeVisible();
  await expect.poll(async () => (await readShoppingList()).find((row) => row.name === "milk")?.checked).toBe(true);
});

test("keyboard: '/' jumps to the add field, Enter adds, Space checks off a run of items", async ({ page }) => {
  await openList(page);
  await page.locator("#main h1").click();
  await page.keyboard.press("/");
  await expect(addField(page)).toBeFocused();
  await page.keyboard.type("garlic");
  await page.keyboard.press("Enter");
  await expect(item(page, "garlic")).toBeVisible();
  // Ready for the next one.
  await expect(addField(page)).toBeFocused();
  await expect(addField(page)).toHaveValue("");

  // Display order: produce (garlic, onion: same aisle, A to Z), dairy (milk), spices (salt).
  await item(page, "garlic").focus();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "onion")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item(page, "garlic")).toBeFocused();
  // Each Space checks one off and moves on to the next.
  await page.keyboard.press("Space");
  await expect(item(page, "garlic")).toHaveAttribute("aria-checked", "true");
  await expect(item(page, "onion")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(item(page, "milk")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(group(page, "Checked").getByRole("checkbox")).toHaveCount(3);
  await expect.poll(async () => (await readShoppingList()).filter((row) => row.checked).map((row) => row.name).sort()).toEqual(["garlic", "milk", "onion"]);
});

test("adding a name already listed warns, and can combine them into one line", async ({ page }) => {
  await openList(page);
  await addField(page).fill("Milk");
  await expect(page.getByText(/Already on your list · 1 line/)).toBeVisible();
  await page.getByRole("textbox", { name: "Quantity" }).fill("2");
  await page.getByRole("textbox", { name: "Unit (optional)" }).fill("l");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "already on your list" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Also listed · 2" })).toHaveCount(2);

  await page.getByRole("button", { name: "Combine into one line" }).click();
  await expect(item(page, /^milk|^Milk/)).toHaveCount(1);
  await expect(item(page, /^milk|^Milk/)).toHaveAccessibleName("milk, 3 L");
  await expect.poll(async () => (await readShoppingList()).filter((row) => row.name.toLowerCase() === "milk").map((row) => row.quantity)).toEqual([3]);
});

test("edit in place, delete, and undo the delete", async ({ page }) => {
  await openList(page);
  await item(page, "onion").focus();
  await page.keyboard.press("e");
  const name = page.getByRole("textbox", { name: "Item name" }).nth(1);
  await expect(name).toBeFocused();
  await name.fill("red onion");
  await page.keyboard.press("Enter");
  await expect(item(page, "red onion")).toBeFocused();
  await expect.poll(async () => (await readShoppingList()).map((row) => row.name)).toContain("red onion");

  // Escape leaves without saving.
  await page.getByRole("button", { name: "Edit milk" }).click();
  await page.keyboard.type("XYZ");
  await page.keyboard.press("Escape");
  await expect(item(page, "milk")).toBeVisible();

  await page.getByRole("button", { name: "Remove salt" }).click();
  await expect(item(page, "salt")).toHaveCount(0);
  await expect.poll(async () => (await readShoppingList()).map((row) => row.name)).not.toContain("salt");
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(item(page, "salt")).toBeVisible();
  await expect.poll(async () => (await readShoppingList()).map((row) => row.name)).toContain("salt");
});

test("'have at home' takes it off the list and keeps it off next time", async ({ page }) => {
  await openList(page);
  await page.getByRole("button", { name: /^Keep salt in the pantry/ }).click();
  await expect(item(page, "salt")).toHaveCount(0);
  await expect(page.getByText("salt will stay off the list next time.")).toBeVisible();
  await expect.poll(readPantryStaples).toContain("salt");
});

test("from recipes: pick recipes, then their ingredients; kept-at-home ones start unticked and matches stack", async ({ page }) => {
  await resetLibrary([PANCAKES, { title: "Green Salad", ingredients: [{ name: "lettuce", quantity: 1, unit: "" }] }]);
  await setPantryStaples(["salt"]);
  await openList(page, [{ name: "milk", quantity: 1, unit: "l" }]);

  await page.getByRole("button", { name: "From recipes" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add from recipes" })).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search recipes" }).fill("pancake");
  await dialog.getByRole("checkbox", { name: /^Fluffy Pancakes/ }).click();
  await dialog.getByRole("button", { name: /Choose ingredients/ }).click();

  await expect(dialog.getByRole("heading", { name: "Fluffy Pancakes" })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^salt, .*In pantry/ })).toHaveAttribute("aria-checked", "false");
  await expect(dialog.getByRole("checkbox", { name: /^flour/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Add 2 items" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(item(page, "flour")).toBeVisible();
  await expect(item(page, "salt")).toHaveCount(0);
  // Milk stacked onto the line already there.
  await expect(item(page, "milk")).toHaveAccessibleName("milk, 2 L");
  await expect.poll(async () => (await readShoppingList()).map((row) => row.name).sort()).toEqual(["flour", "milk"]);
});

test("clear checked and clear the whole list, each after asking", async ({ page }) => {
  await openList(page, [...WEEK.slice(0, 2), { name: "salt", checked: true }]);
  await group(page, "Checked").getByRole("button", { name: "Clear checked" }).click();
  const ask = page.getByRole("dialog", { name: "Clear checked items?" });
  await expect(ask).toContainText("1 item will be removed.");
  await ask.getByRole("button", { name: "Clear checked" }).click();
  await expect(item(page, "salt")).toHaveCount(0);

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Clear list" }).click();
  const askAll = page.getByRole("dialog", { name: "Delete entire list?" });
  await askAll.getByRole("button", { name: "Cancel" }).click();
  await expect(item(page, "onion")).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Clear list" }).click();
  await page.getByRole("dialog", { name: "Delete entire list?" }).getByRole("button", { name: "Delete all" }).click();
  await expect(page.getByRole("heading", { name: "List is empty" })).toBeVisible();
  await expect.poll(readShoppingList).toEqual([]);
});

test("changes made on the phone show when you come back to the tab", async ({ page }) => {
  await openList(page);
  await addListItems([{ name: "bread" }]);
  await checkListItem("onion");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(item(page, "bread")).toBeVisible();
  await expect(item(page, "onion")).toHaveAttribute("aria-checked", "true");
});

test("an empty list says so; a list that fails to load offers to try again", async ({ page }) => {
  await openList(page, []);
  await expect(page.getByRole("heading", { name: "List is empty" })).toBeVisible();
  await expect(addField(page)).toBeVisible();

  await resetShoppingList(WEEK);
  await page.route("**/rest/v1/shopping_list_items**", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("heading", { name: /load list/ })).toBeVisible();
  await page.unroute("**/rest/v1/shopping_list_items**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(item(page, "milk")).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("reads right to left in Hebrew, with nothing off the side", async ({ page }) => {
    await openList(page);
    await writeAccountPrefs({ locale: "he" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#main h1")).toHaveText("רשימה");
    await expect(page.locator("#main section h2").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await writeAccountPrefs({ locale: "en" });
  });
});

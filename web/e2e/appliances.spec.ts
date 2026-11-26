import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, type SeedRecipe } from "./admin";
import { readAccountAppliances, resetTestUserAppliances, setRecipeAppliances, writeAccountAppliances } from "./appliancesSeed";
import { signInWithPassword } from "./helpers";
import { remixHandler, stubFunctions } from "./recipeActionsSeed";
import { TEST_USER } from "./testUser";

// "My appliances" (PIN-155). The list lives on the account (`user_metadata.appliances`), so "the phone ticked it" is
// played by writing the account the way the mobile app does (appliancesSeed.ts). Not set = recipes check nothing.

test.use({ locale: "en-US", viewport: { width: 1280, height: 900 } });

test.beforeEach(async () => {
  await resetTestUserAppliances();
});

test.afterEach(async () => {
  await resetTestUserAppliances();
});

const MERINGUES: SeedRecipe = {
  title: "Stand Mixer Meringues",
  servings: 4,
  ingredients: [
    { name: "egg whites", quantity: 4, unit: "" },
    { name: "sugar", quantity: 200, unit: "g" },
  ],
  instructions: [
    { step: 1, text: "Heat the oven to 100°C." },
    { step: 2, text: "Whip the egg whites in the stand mixer to stiff peaks, adding the sugar slowly." },
    { step: 3, text: "Pipe and bake for 90 minutes." },
  ],
};

const MERINGUE_APPLIANCES = [
  { key: "oven", required: true, steps: [1, 3] },
  { key: "stand_mixer", required: true, steps: [2] },
];

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
}

async function openMeringues(page: Page) {
  const [id] = await resetLibrary([MERINGUES]);
  await setRecipeAppliances(id, MERINGUE_APPLIANCES);
  await signIn(page);
  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1:visible")).toHaveText(MERINGUES.title);
  return id;
}

const main = (page: Page) => page.locator("#main");
const appliancesCard = (page: Page) => main(page).getByRole("region", { name: "My appliances" });
const section = (page: Page) => page.getByTestId("recipe-appliances");

test("before a list is saved, recipes warn about nothing and offer to set it up", async ({ page }) => {
  await openMeringues(page);
  await expect(section(page).getByTestId("appliance-chip-stand_mixer")).toBeVisible();
  await expect(section(page).getByTestId("appliances-missing")).toHaveCount(0);
  await expect(section(page).getByTestId("appliance-chip-stand_mixer")).not.toHaveAttribute("data-fit", /.+/);

  await section(page).getByRole("link", { name: /Tell Pinch what's in your kitchen/ }).click();
  await expect(page).toHaveURL(/\/app\/settings\/recipe#appliances$/);
  await expect(appliancesCard(page)).toBeInViewport();
  await expect(appliancesCard(page).getByTestId("appliances-status")).toContainText("Not set up yet");
  // The basics start ticked; nothing special does.
  await expect(appliancesCard(page).getByRole("button", { name: /^Oven/ })).toHaveAttribute("aria-pressed", "true");
  await expect(appliancesCard(page).getByRole("button", { name: /^Stand mixer/ })).toHaveAttribute("aria-pressed", "false");
  expect(await readAccountAppliances()).toBeFalsy();
});

test("a list ticked on the phone shows here, and a recipe needing what's missing says so", async ({ page }) => {
  await writeAccountAppliances(["stovetop", "oven", "hand_mixer", "blender"]);
  const id = await openMeringues(page);

  const mixer = section(page).getByTestId("appliance-chip-stand_mixer");
  await expect(mixer).toHaveAttribute("data-fit", "missing");
  await expect(section(page).getByTestId("appliance-chip-oven")).toHaveAttribute("data-fit", "owned");
  const note = section(page).getByTestId("appliances-missing");
  await expect(note).toContainText("Not in your kitchen");
  await expect(note).toContainText("Stand mixer");
  await expect(note.getByRole("button", { name: "Make it without these" })).toBeVisible();

  await page.goto("/app/settings/recipe");
  await expect(appliancesCard(page).getByTestId("appliances-status")).toContainText("2 appliances ticked");
  await expect(appliancesCard(page).getByRole("button", { name: /^Hand mixer/ })).toHaveAttribute("aria-pressed", "true");
  await expect(appliancesCard(page).getByRole("button", { name: /^Microwave/ })).toHaveAttribute("aria-pressed", "false");

  // Ticked on the phone again (a stand mixer after all): back on the recipe, everything is there.
  await writeAccountAppliances(["stovetop", "oven", "hand_mixer", "blender", "stand_mixer"]);
  await page.reload();
  await expect(appliancesCard(page).getByRole("button", { name: /^Stand mixer/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/app/recipe/${id}`);
  await expect(section(page).getByTestId("appliances-ready")).toHaveText("You have everything");
  await expect(section(page).getByTestId("appliances-missing")).toHaveCount(0);
});

test("ticking here saves on the account, so the phone gets it", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/settings/recipe");
  await appliancesCard(page).getByRole("button", { name: /^Air fryer/ }).click();
  await expect(appliancesCard(page).getByRole("button", { name: /^Air fryer/ })).toHaveAttribute("aria-pressed", "true");
  await expect(main(page).getByRole("status").getByText("Saved")).toBeVisible();
  await expect.poll(async () => (await readAccountAppliances())?.owned).toEqual(["stovetop", "oven", "microwave", "air_fryer"]);
  expect((await readAccountAppliances())?.notOwned).toContain("stand_mixer");

  // Unticking a basic saves it as not owned.
  await appliancesCard(page).getByRole("button", { name: /^Microwave/ }).click();
  await expect.poll(async () => (await readAccountAppliances())?.notOwned).toContain("microwave");
  await page.reload();
  await expect(appliancesCard(page).getByRole("button", { name: /^Microwave/ })).toHaveAttribute("aria-pressed", "false");
  await expect(appliancesCard(page).getByRole("button", { name: /^Air fryer/ })).toHaveAttribute("aria-pressed", "true");
});

test("a kitchen with nothing special can say so, and stop checking later", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/settings/recipe");
  await appliancesCard(page).getByRole("button", { name: "I have none of these" }).click();
  await expect(appliancesCard(page).getByTestId("appliances-status")).toContainText("0 appliances ticked");
  await expect.poll(async () => (await readAccountAppliances())?.owned).toEqual(["stovetop", "oven", "microwave"]);

  await appliancesCard(page).getByRole("button", { name: "Stop checking" }).click();
  const dialog = page.getByRole("dialog", { name: "Stop checking your kitchen?" });
  await dialog.getByRole("button", { name: "Clear my list" }).click();
  await expect(dialog).toBeHidden();
  await expect(appliancesCard(page).getByTestId("appliances-status")).toContainText("Not set up yet");
  // Cleared: GoTrue drops a key set to null, so it reads back as missing.
  await expect.poll(async () => (await readAccountAppliances()) ?? null).toBeNull();
});

test("“Make it without these” asks to work around the missing appliance, and the note goes once it's done", async ({ page }) => {
  await writeAccountAppliances(["stovetop", "oven", "hand_mixer"]);
  const calls = await stubFunctions(page, {
    "transform-recipe": remixHandler({
      servings: 4,
      summary: "Whipped the whites with a hand mixer instead of a stand mixer.",
      ingredients: MERINGUES.ingredients,
      instructions: [
        { step: 1, text: "Heat the oven to 100°C." },
        { step: 2, text: "Whip the egg whites with a hand mixer to stiff peaks, adding the sugar slowly." },
        { step: 3, text: "Pipe and bake for 90 minutes." },
      ],
      // The steps changed, so the server sends the new list (ADR 017).
      appliances: [
        { key: "oven", required: true, steps: [1, 3], origin: "source" },
        { key: "hand_mixer", required: true, steps: [2], origin: "source" },
      ],
    }),
  });
  await openMeringues(page);

  await section(page).getByTestId("appliances-missing").getByRole("button", { name: "Make it without these" }).click();
  const sheet = page.getByRole("dialog", { name: "Make it without these" });
  await expect(sheet).toContainText("Whipped the whites with a hand mixer");
  const instruction = String(calls[0].body.instruction);
  expect(instruction).toContain("My kitchen has no stand mixer");
  expect(instruction).toContain("I can use my hand mixer");

  await sheet.getByRole("button", { name: "Use this version" }).click();
  await expect(sheet).toBeHidden();
  await expect(section(page).getByTestId("appliances-missing")).toHaveCount(0);
  await expect(section(page).getByTestId("appliances-ready")).toBeVisible();
  await page.reload();
  await expect(section(page).getByTestId("appliance-chip-hand_mixer")).toHaveAttribute("data-fit", "owned");
});

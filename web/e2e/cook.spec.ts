import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { setRecipeVideo, setTestUserLanguage, type RecipeVideoSeed } from "./cookSeed";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

/**
 * Cooking with the recipe open (PIN-136): cook along (the source video beside the recipe, step times that jump)
 * and cook mode (one step at a time). The real players never load here: every request to the video sites gets an
 * empty page, so the tests check what the page asks the players for (the iframe's address), not the video itself.
 */

const STEPS = [
  { step: 1, text: "Whisk the flour and milk.", timestamp_seconds: 12 },
  { step: 2, text: "Rest the batter for 10 minutes.", timestamp_seconds: 83 },
  { step: 3, text: "Cook on a hot pan until golden." },
];

const PANCAKES: SeedRecipe = {
  title: "Cook-along Pancakes",
  servings: 2,
  ingredients: [{ name: "flour", quantity: 1, unit: "cup" }],
  instructions: STEPS.map(({ step, text }) => ({ step, text })),
};

const VIDEOS: Record<string, RecipeVideoSeed> = {
  youtube: { platform: "youtube", original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", instructions: STEPS },
  tiktok: { platform: "tiktok", original_url: "https://www.tiktok.com/@chef/video/7234567890123456789", instructions: STEPS },
  instagram: { platform: "instagram", original_url: "https://www.instagram.com/reel/C1abcDEF234/", instructions: STEPS },
  facebook: { platform: "facebook", original_url: "https://www.facebook.com/reel/774239929117468", instructions: STEPS },
};

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  // No real video site in tests: each answers with an empty page.
  await page.route(/^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|tiktok\.com|instagram\.com|facebook\.com|fbcdn\.net)\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub player</title>" }),
  );
});

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
}

/** Seeds the recipe with `video`, signs in and opens it. */
async function openRecipe(page: Page, video?: RecipeVideoSeed) {
  const [id] = await resetLibrary([PANCAKES]);
  if (video) await setRecipeVideo(id, video);
  await signIn(page);
  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1")).toHaveText(PANCAKES.title);
  return id;
}

const player = (page: Page) => page.getByTitle("Cook along video");
const playerSrc = async (page: Page) => new URL((await player(page).getAttribute("src")) ?? "");
const steps = (page: Page) => page.getByRole("region", { name: /Instructions/ });

test("cook along plays the YouTube video beside the steps, and a step's time jumps to it", async ({ page }) => {
  await openRecipe(page, VIDEOS.youtube);
  // Its label turns into "Hide video" while the player is open.
  const toggle = page.getByRole("button", { name: /Cook along|Hide video/ });
  await expect(toggle).toContainText("YouTube");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const src = await playerSrc(page);
  expect(src.origin + src.pathname).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  expect(src.searchParams.get("enablejsapi")).toBe("1");
  expect(src.searchParams.get("origin")).toBe(new URL(page.url()).origin);

  // Desktop: a column at the end side, beside the steps.
  const playerBox = (await page.getByTestId("cook-along").boundingBox())!;
  const stepsBox = (await steps(page).boundingBox())!;
  expect(playerBox.x).toBeGreaterThan(stepsBox.x + stepsBox.width - 1);

  // The stub never answers like a real player, so the jump reloads it at the step's time.
  await steps(page).getByRole("button", { name: "Play the video from 1:23" }).click();
  await expect.poll(async () => (await playerSrc(page)).searchParams.get("start")).toBe("83");

  await expect(page.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", /youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  await page.getByRole("button", { name: "Close cook-along video" }).click();
  await expect(player(page)).toHaveCount(0);
});

test("a step's time opens the player when it is closed", async ({ page }) => {
  await openRecipe(page, VIDEOS.youtube);
  await steps(page).getByRole("button", { name: "Play the video from 0:12" }).click();
  await expect(player(page)).toBeVisible();
  expect((await playerSrc(page)).searchParams.get("start")).toBe("12");
});

for (const [name, expected] of [
  ["tiktok", "https://www.tiktok.com/player/v1/7234567890123456789"],
  ["instagram", "https://www.instagram.com/reel/C1abcDEF234/embed/"],
  ["facebook", "https://www.facebook.com/plugins/video.php"],
] as const) {
  test(`cook along plays a ${name} video`, async ({ page }) => {
    await openRecipe(page, VIDEOS[name]);
    await page.getByRole("button", { name: /Cook along/ }).click();
    const src = await playerSrc(page);
    expect(src.origin + src.pathname).toBe(expected.split("?")[0]);
  });
}

test("Instagram can't seek, so the panel says where to skip to", async ({ page }) => {
  await openRecipe(page, VIDEOS.instagram);
  await steps(page).getByRole("button", { name: "Play the video from 1:23" }).click();
  await expect(page.getByTestId("cook-along")).toContainText("Skip to 1:23");
});

test("a video that can't be embedded opens on its own site", async ({ page }) => {
  await openRecipe(page, { platform: "tiktok", original_url: "https://vm.tiktok.com/ZMabc123/", instructions: STEPS });
  await expect(page.getByRole("button", { name: /Cook along/ })).toHaveCount(0);
  const link = page.getByRole("link", { name: /Watch on TikTok/ });
  await expect(link).toHaveAttribute("href", "https://vm.tiktok.com/ZMabc123/");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a web recipe without a video has cook mode but no cook along", async ({ page }) => {
  await openRecipe(page);
  await expect(page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cook along/ })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the video is a panel above the recipe that can be made taller", async ({ page }) => {
    await openRecipe(page, VIDEOS.youtube);
    await page.getByRole("button", { name: /Cook along/ }).click();
    const panel = page.getByTestId("cook-along");
    await expect(panel).toBeInViewport();

    const handle = panel.getByRole("separator", { name: "Resize the video" });
    const before = (await player(page).boundingBox())!.height;
    await handle.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await player(page).boundingBox())!.height).toBeGreaterThan(before);

    // Steps scroll under it; it stays at the top. On a phone the steps are a tab of their own.
    await page.getByRole("tab", { name: "Steps" }).click();
    await steps(page).getByText("Cook on a hot pan until golden.").scrollIntoViewIfNeeded();
    await expect(panel).toBeInViewport();
  });
});

test("cook mode shows one step at a time, moves with keys and buttons, and finishes", async ({ page }) => {
  await openRecipe(page, VIDEOS.youtube);
  await page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" }).click();
  const dialog = page.getByRole("dialog", { name: PANCAKES.title });
  const step = page.getByTestId("cook-mode-step");
  await expect(dialog).toContainText("Step 1 of 3");
  await expect(step).toHaveText("Whisk the flour and milk.");

  await page.keyboard.press("ArrowRight");
  await expect(step).toHaveText("Rest the batter for 10 minutes.");
  // A time in the step becomes a timer.
  await dialog.getByRole("button", { name: "Start 10 minutes timer" }).click();
  await expect(dialog.getByRole("timer")).toHaveText(/^(10:00|9:5\d)$/);

  await page.keyboard.press("ArrowLeft");
  await expect(step).toHaveText("Whisk the flour and milk.");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(step).toHaveText("Cook on a hot pan until golden.");
  await dialog.getByRole("button", { name: "Finish" }).click();
  await expect(dialog.getByRole("heading", { name: "That’s it" })).toBeVisible();

  // Closing and reopening comes back where you were; after finishing, it starts over.
  await dialog.getByRole("button", { name: "Back to the recipe" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" }).click();
  await expect(step).toHaveText("Whisk the flour and milk.");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" }).click();
  await expect(step).toHaveText("Rest the batter for 10 minutes.");
});

test("cook mode reads the step shown aloud, and stops when it closes", async ({ page }) => {
  // The browser's speech is replaced by a recorder: no sound in tests, and we can see what would be said.
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let cancels = 0;
    // `hold` keeps the current utterance "speaking", so closing has something to stop.
    const state = { hold: false };
    class Utterance {
      lang = "";
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.assign(window, { SpeechSynthesisUtterance: Utterance, __speech: { spoken, cancels: () => cancels, state } });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [{ voiceURI: "test-en", lang: "en-US", name: "Test", localService: true, default: true }],
        speak: (utterance: Utterance) => {
          spoken.push(utterance.text);
          setTimeout(() => {
            if (!state.hold) utterance.onend?.();
          }, 10);
        },
        cancel: () => void (cancels += 1),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
  await openRecipe(page);
  await page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" }).click();
  const dialog = page.getByRole("dialog", { name: PANCAKES.title });
  const spoken = () => page.evaluate(() => (window as unknown as { __speech: { spoken: string[] } }).__speech.spoken);
  const speaker = dialog.getByRole("button", { name: "Read steps aloud" });
  await expect(speaker).toHaveAttribute("aria-pressed", "false");

  await speaker.click();
  await expect(speaker).toHaveAttribute("aria-pressed", "true");
  await expect.poll(spoken).toEqual(["Step 1 of 3.", "Whisk the flour and milk."]);
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect.poll(async () => (await spoken()).slice(-2)).toEqual(["Step 2 of 3.", "Rest the batter for 10 minutes."]);
  await dialog.getByRole("button", { name: "Read again" }).click();
  await expect.poll(async () => (await spoken()).length).toBe(6);

  const cancels = () => page.evaluate(() => (window as unknown as { __speech: { cancels: () => number } }).__speech.cancels());
  await page.evaluate(() => void ((window as unknown as { __speech: { state: { hold: boolean } } }).__speech.state.hold = true));
  await dialog.getByRole("button", { name: "Read again" }).click();
  await expect.poll(async () => (await spoken()).length).toBe(7);
  const before = await cancels();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await cancels()).toBeGreaterThan(before);

  // The choice is remembered: cook mode opens reading.
  await page.getByTestId("cook-bar").getByRole("button", { name: "Start cooking" }).click();
  await expect(dialog.getByRole("button", { name: "Read steps aloud" })).toHaveAttribute("aria-pressed", "true");
});

test("in Hebrew, the left arrow is next in cook mode", async ({ page }) => {
  await setTestUserLanguage("he");
  await openRecipe(page, VIDEOS.youtube);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByTestId("cook-bar").getByRole("button").first().click();
  const step = page.getByTestId("cook-mode-step");
  await expect(step).toHaveText("Whisk the flour and milk.");
  await page.keyboard.press("ArrowLeft");
  await expect(step).toHaveText("Rest the batter for 10 minutes.");
  await page.keyboard.press("ArrowRight");
  await expect(step).toHaveText("Whisk the flour and milk.");

  // Next sits at the left end of the row, under the left arrow.
  const next = page.getByRole("dialog").getByRole("button", { name: "הבא" });
  const back = page.getByRole("dialog").getByRole("button", { name: "הקודם" });
  expect((await next.boundingBox())!.x).toBeLessThan((await back.boundingBox())!.x);
});

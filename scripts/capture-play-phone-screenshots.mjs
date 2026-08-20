/**
 * Capture Google Play phone screenshots (9:16 PNG) from Expo web at a
 * compact (phone) viewport. Seeds guest library + shopping list so the
 * shots show a cooked kitchen rather than empty states.
 *
 * Usage: npx playwright install chromium  (or use channel: 'msedge')
 *        node scripts/capture-play-phone-screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'assets', 'store', 'phone');
const BASE = (process.env.PINCH_SCREENSHOT_URL || 'http://localhost:8081').replace(/\/$/, '');

async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    path.join(process.env.TEMP || '/tmp', 'pw-pinch', 'node_modules', 'playwright', 'index.mjs'),
    'playwright',
  ].filter(Boolean);
  let lastError;
  for (const candidate of candidates) {
    try {
      const spec = candidate.includes('\\') || candidate.includes('/')
        ? pathToFileURL(candidate).href
        : candidate;
      const mod = await import(spec);
      return mod.chromium;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const VIEWPORT = { width: 1080, height: 1920 };
const now = new Date().toISOString();

const RECIPES = [
  {
    id: 'guest-lemon-pasta',
    title: 'Lemon garlic pasta',
    original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'youtube',
    image_url:
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1200&q=80',
    servings: 4,
    calories: 520,
    estimated_time_minutes: 25,
    cost_estimate: '$',
    effort_level: 'Easy',
    extraction_status: 'full',
    extraction_source: 'video',
    tags: ['dinner', 'pasta', 'weeknight'],
    is_favorite: true,
    source_language: 'en',
    created_at: now,
    ingredients: [
      { name: 'spaghetti', quantity: 400, unit: 'g' },
      { name: 'garlic cloves', quantity: 4, unit: '' },
      { name: 'lemon', quantity: 1, unit: '' },
      { name: 'olive oil', quantity: 3, unit: 'tbsp' },
      { name: 'parmesan', quantity: 40, unit: 'g' },
    ],
    instructions: [
      { step: 1, text: 'Boil the spaghetti in salted water until al dente.' },
      { step: 2, text: 'Gently fry the garlic in olive oil until fragrant.' },
      { step: 3, text: 'Toss pasta with lemon zest, juice, oil, and parmesan.' },
    ],
  },
  {
    id: 'guest-choco-cookies',
    title: 'Chewy chocolate cookies',
    original_url: 'https://www.instagram.com/reel/example',
    platform: 'instagram',
    image_url:
      'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80',
    servings: 12,
    calories: 180,
    estimated_time_minutes: 40,
    cost_estimate: '$',
    effort_level: 'Easy',
    extraction_status: 'full',
    extraction_source: 'description',
    tags: ['dessert', 'baking', 'cookies'],
    is_favorite: true,
    source_language: 'en',
    created_at: now,
    ingredients: [
      { name: 'butter', quantity: 115, unit: 'g' },
      { name: 'brown sugar', quantity: 150, unit: 'g' },
      { name: 'egg', quantity: 1, unit: '' },
      { name: 'flour', quantity: 180, unit: 'g' },
      { name: 'dark chocolate', quantity: 150, unit: 'g' },
    ],
    instructions: [
      { step: 1, text: 'Cream butter and sugar, then beat in the egg.' },
      { step: 2, text: 'Fold in flour and chopped chocolate.' },
      { step: 3, text: 'Scoop onto a tray and bake at 180°C for 10–12 minutes.' },
    ],
  },
  {
    id: 'guest-sesame-salad',
    title: 'Sesame cucumber salad',
    original_url: 'https://www.tiktok.com/@example/video/1',
    platform: 'tiktok',
    image_url:
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80',
    servings: 2,
    calories: 140,
    estimated_time_minutes: 15,
    cost_estimate: '$',
    effort_level: 'Easy',
    extraction_status: 'full',
    extraction_source: 'captions',
    tags: ['salad', 'side', 'quick'],
    is_favorite: false,
    source_language: 'en',
    created_at: now,
    ingredients: [
      { name: 'cucumbers', quantity: 2, unit: '' },
      { name: 'sesame oil', quantity: 1, unit: 'tbsp' },
      { name: 'rice vinegar', quantity: 2, unit: 'tbsp' },
      { name: 'soy sauce', quantity: 1, unit: 'tbsp' },
      { name: 'sesame seeds', quantity: 1, unit: 'tsp' },
    ],
    instructions: [
      { step: 1, text: 'Slice the cucumbers thin and salt them for 5 minutes.' },
      { step: 2, text: 'Whisk sesame oil, vinegar, and soy sauce.' },
      { step: 3, text: 'Toss, then finish with sesame seeds.' },
    ],
  },
  {
    id: 'guest-tahini-oats',
    title: 'Honey tahini overnight oats',
    original_url: 'https://www.youtube.com/watch?v=example2',
    platform: 'youtube',
    image_url:
      'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=1200&q=80',
    servings: 1,
    calories: 390,
    estimated_time_minutes: 10,
    cost_estimate: '$',
    effort_level: 'Easy',
    extraction_status: 'full',
    extraction_source: 'description',
    tags: ['breakfast', 'make-ahead'],
    is_favorite: false,
    source_language: 'en',
    created_at: now,
    ingredients: [
      { name: 'rolled oats', quantity: 50, unit: 'g' },
      { name: 'milk', quantity: 120, unit: 'ml' },
      { name: 'tahini', quantity: 1, unit: 'tbsp' },
      { name: 'honey', quantity: 1, unit: 'tbsp' },
    ],
    instructions: [
      { step: 1, text: 'Stir oats, milk, tahini, and honey in a jar.' },
      { step: 2, text: 'Chill overnight and top with fruit in the morning.' },
    ],
  },
];

const SHOPPING = [
  item('spaghetti', 400, 'g', false),
  item('lemons', 3, '', false),
  item('garlic', 1, 'head', false),
  item('dark chocolate', 200, 'g', false),
  item('cucumbers', 2, '', true),
  item('tahini', 1, 'jar', false),
];

function item(name, quantity, unit, checked) {
  return {
    id: `guest-item-${name.replace(/\s+/g, '-')}`,
    name,
    quantity,
    unit: unit || null,
    checked,
    created_at: now,
    updated_at: now,
  };
}

const SEEDED_STORAGE = {
  'pinch:onboardingComplete': 'true',
  'pinch.themePreference': 'dark',
  'pinch:appLanguage': 'en',
  'pinch:measurementSystem': 'original',
  'pinch:guest-recipes': JSON.stringify(RECIPES),
  'pinch:guest-shopping-list': JSON.stringify(SHOPPING),
};

async function seedStorage(page, extra = {}) {
  await page.addInitScript(
    ({ seeded }) => {
      for (const [key, value] of Object.entries(seeded)) {
        localStorage.setItem(key, value);
      }
    },
    { seeded: { ...SEEDED_STORAGE, ...extra } },
  );
}

async function hideChrome(page) {
  await page.addStyleTag({
    content: `
      html, body, #root { height: 100% !important; }
      body { margin: 0 !important; overflow: hidden !important; }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    `,
  });
}

async function dismissOnboarding(page) {
  const welcome = page.getByText('Welcome to Pinch');
  try {
    await welcome.waitFor({ timeout: 8000 });
  } catch {
    return;
  }
  const continueBtn = page.getByRole('button', { name: /continue|next/i }).first();
  if (await continueBtn.count()) {
    await continueBtn.click();
    await page.waitForTimeout(400);
  }
  const skip = page.getByRole('button', { name: /skip/i });
  if (await skip.count()) {
    await skip.click();
    await page.waitForTimeout(800);
  }
}

async function waitForApp(page, text, timeout = 45000) {
  await dismissOnboarding(page);
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  } catch (err) {
    const dest = path.join(OUT_DIR, `_debug-${text.replace(/\W+/g, '-').slice(0, 40)}.png`);
    await page.screenshot({ path: dest, type: 'png' });
    const body = await page.locator('body').innerText().catch(() => '');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    console.error('debug screenshot', dest);
    console.error('url', page.url());
    console.error('localStorage keys', keys);
    console.error('visible text:\n', body.slice(0, 1200));
    throw err;
  }
  await page.waitForTimeout(1200);
}

async function shot(page, name) {
  const dest = path.join(OUT_DIR, name);
  await page.screenshot({ path: dest, type: 'png' });
  console.log('wrote', dest);
}

async function openBrowser(chromium) {
  const launchers = [
    () => chromium.launch({ channel: 'msedge', headless: true }),
    () => chromium.launch({ channel: 'chrome', headless: true }),
    () => chromium.launch({ headless: true }),
  ];
  let lastError;
  for (const launch of launchers) {
    try {
      return await launch();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function withPage(browser, extraStorage, fn) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
  });
  await seedStorage(context, extraStorage);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const chromium = await loadChromium();
  const browser = await openBrowser(chromium);

  try {
    await withPage(browser, {}, async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await hideChrome(page);
      await page.getByText('Pinch').first().waitFor({ timeout: 90000 });
      await waitForApp(page, 'Lemon garlic pasta');
      await shot(page, '01-library.png');

      await page.goto(`${BASE}/recipe/guest-lemon-pasta`, { waitUntil: 'domcontentloaded' });
      await hideChrome(page);
      await waitForApp(page, 'Ingredients');
      await shot(page, '02-recipe.png');

      await page.goto(`${BASE}/add`, { waitUntil: 'domcontentloaded' });
      await hideChrome(page);
      await waitForApp(page, 'Snap a recipe');
      await shot(page, '03-snap.png');

      await page.goto(`${BASE}/list`, { waitUntil: 'domcontentloaded' });
      await hideChrome(page);
      await waitForApp(page, 'spaghetti');
      await shot(page, '04-list.png');
    });

    await withPage(
      browser,
      { 'pinch:onboardingComplete': 'false' },
      async (page) => {
        await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
        await hideChrome(page);
        await waitForApp(page, 'Welcome to Pinch');
        const continueBtn = page.getByRole('button', { name: /continue|next/i }).first();
        if (await continueBtn.count()) {
          await continueBtn.click();
          await page.waitForTimeout(800);
        }
        await shot(page, '05-onboarding.png');
      },
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

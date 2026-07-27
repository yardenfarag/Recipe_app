/**
 * Regenerate i18n locale catalogs from English via Gemini.
 * Usage: node scripts/localize-ui.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const raw = readFileSync(join(root, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY / GOOGLE_API_KEY');
  process.exit(1);
}

const english = {
  common: {
    tryAgain: 'Please try again.',
    notNow: 'Not now',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    close: 'Close',
    continue: 'Continue',
    upgrade: 'Upgrade',
  },
  tabs: {
    library: 'Library',
    snap: 'Snap',
    list: 'List',
    settings: 'Settings',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Account & appearance',
    language: 'Language',
    languageHint:
      'This sets the app language and auto-translates recipes. Hebrew and Arabic may ask you to reload so the layout flips the right way.',
    lightDark: 'Light / dark',
    driftTheme: 'Drift theme',
    measurements: 'Recipe measurements',
    measurementsHint:
      'Default for every recipe — cups & spoons, or grams & milliliters. You can still flip it on any recipe.',
    guest: 'Guest',
    signedIn: 'Signed in · {{plan}}',
    signInToSync: 'Sign in to sync your recipes across devices',
    signOut: 'Sign out',
    signIn: 'Sign in',
    deleteAccount: 'Delete account',
    plan: 'Plan',
    planFree: 'Free',
    planPlus: 'Pinch Plus',
    planDetailPlusRemaining: '{{remaining}}/{{limit}} saves left this month',
    planDetailPlus: '{{limit}} saves / month',
    planDetailFreeRemaining: '{{remaining}}/{{limit}} free saves left',
    planDetailFree: '{{limit}} free lifetime saves',
    planBlurb:
      'Pinch Plus will be {{price}} when billing goes live. Saved recipes, remixes, and translations never burn your extract quota. {{billingNote}}',
    billingNote: 'Billing isn’t live yet — upgrade is free for now.',
    upgrade: 'Upgrade to Plus',
    cancelSubscription: 'Cancel subscription',
    upgradeConfirmTitle: 'Upgrade to Pinch Plus?',
    upgradeSuccessTitle: 'You’re on Plus',
    upgradeSuccessBody: '{{limit}} recipe saves per month.',
    upgradeFailedTitle: 'Couldn’t upgrade',
    cancelConfirmTitle: 'Cancel Pinch Plus?',
    cancelConfirmBody: 'You’ll go back to Free. Any free saves you still have stay put.',
    cancelConfirmAction: 'Cancel Plus',
    cancelSuccessTitle: 'Subscription canceled',
    cancelSuccessBody: 'You’re back on Free.',
    cancelFailedTitle: 'Couldn’t cancel',
    signOutFailedTitle: 'Couldn’t sign out',
    deleteConfirmTitle: 'Delete account?',
    deleteConfirmBody:
      'This permanently deletes your recipes, photo, plan, and account. There’s no undo.',
    deleteConfirmFinalTitle: 'Really delete?',
    deleteConfirmFinalBody: 'Delete your Pinch account forever?',
    deleteSuccessTitle: 'Account deleted',
    deleteSuccessBody: 'Your Pinch account and data are gone.',
    deleteFailedTitle: 'Couldn’t delete account',
    signInRequiredTitle: 'Sign in needed',
    signInRequiredBody: 'Sign in to add a profile photo.',
    changeAvatarTitle: 'Change profile photo',
    takePhoto: 'Take photo',
    chooseLibrary: 'Choose from library',
    permissionNeededTitle: 'Permission needed',
    permissionCamera: 'Turn on camera access for Pinch in your phone settings to continue.',
    permissionLibrary: 'Turn on photo library access for Pinch in your phone settings to continue.',
    uploadFailedTitle: 'Upload failed',
    imageReadFailedTitle: 'Something went wrong',
    imageReadFailedBody: 'Couldn’t read that photo.',
    migrationTitle: 'Local recipes didn’t sync',
    migrationRetry: 'Try sync again',
    legalSupport: 'Legal & support',
    privacyPolicy: 'Privacy Policy',
    termsOfUse: 'Terms of Use',
    deleteAccountWeb: 'Delete account (web)',
    reportIssue: 'Report an issue',
    emailSupport: 'Email support',
    adminTitle: 'Admin · Usage & support',
    adminBody: 'Cost log, support tickets, and plan tools — just for you.',
    rtlReloadTitle: 'Reload for layout?',
    rtlReloadBody:
      'Hebrew and Arabic need a right-to-left layout. Reload now so navigation and headers flip correctly.',
    rtlReloadConfirm: 'Reload',
    rtlReloadLater: 'Later',
  },
  theme: {
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
    a11y: 'Theme: {{mode}}. Tap to change.',
  },
  measurement: {
    spoons: 'Spoons',
    grams: 'Grams',
    metricHint: 'Liquids in ml · solids in g · cloves & pinches stay as written',
  },
  themes: {
    mist: {
      name: 'Mist Drift',
      blurb: 'Soft lilac-slate calm — drifting mist.',
    },
    fruity: {
      name: 'Fruity Drift',
      blurb: 'Berry crush with floating fruit & bubbles.',
    },
    cat: {
      name: 'Cat Drift',
      blurb: 'Cream fur vibes — soft paws & twitching ears.',
    },
    potter: {
      name: 'Potter Drift',
      blurb: 'Parchment glow — floating candles & sparks.',
    },
    dracula: {
      name: 'Dracula Drift',
      blurb: 'Midnight velvet — soft bats under the moon.',
    },
    sunny: {
      name: 'Sunny Drift',
      blurb: 'Warm honey light with gentle sunbeams.',
    },
    starry: {
      name: 'Starry Night Drift',
      blurb: 'Indigo sky — twinkles & shooting stars.',
    },
  },
  auth: {
    signUp: 'Sign up',
    welcome: 'Welcome',
  },
  recipe: {
    preview: 'Preview',
    save: 'Save recipe',
    noPreview: 'Nothing to preview yet. Snap a recipe first.',
    goToLibrary: 'Go to Library',
    guestLimitTitle: 'Free limit reached',
    guestLimitBody:
      'Guests can save up to {{limit}} recipes ({{saved}} saved). Sign up to save more.',
    saveFailedTitle: 'Couldn’t save',
    saveFailedBody: 'Your remix might not have saved. Try again.',
    loadFailed: 'Couldn’t load this recipe.',
    loadFailedTitle: 'Couldn’t load recipe',
    notFound: 'Recipe not found.',
    favoriteFailedTitle: 'Couldn’t update favorite',
    translateFailedTitle: 'Translation unavailable',
    translating: 'Translating recipe…',
    showingLanguage: 'Showing {{language}}',
    showOriginal: 'Show original language',
    translateTitle: 'Translate recipe',
    translateHint: 'Recipes stay in their original language until you pick one below.',
  },
  library: {
    title: 'Your recipes',
    subtitle: 'Your kitchen',
    empty: 'No recipes yet',
    emptyHint: 'Share a cooking video, or paste a link on Snap.',
  },
  onboarding: {
    skip: 'Skip',
    continue: 'Continue',
    next: 'Next',
    welcomeTitle: 'Welcome to Pinch',
    welcomeSubtitle: 'Pick the language that feels like home.',
    languageLabel: 'App language',
    shareTitle: 'Share a recipe in',
    shareBody: 'Share from TikTok, Instagram, or YouTube — or paste a link on Snap.',
    saveTitle: 'Save it to your kitchen',
    saveBody: 'Preview, tap Save, and find it anytime in your Library.',
    collectionsTitle: 'Organize with collections',
    collectionsBody: 'Group recipes for dinner, baking, weeknights — whatever helps you cook.',
    customizeTitle: 'Make it yours',
    customizeBody: 'Swap ingredients, remix for your goals (after you sign in), and send stuff to your list.',
    readyTitle: "You're all set",
    readyBody: 'Snap your first recipe and start building your kitchen.',
    ctaSnap: 'Snap a recipe',
    ctaLibrary: 'Explore Library',
  },
  snap: {
    title: 'Snap a recipe',
    subtitle: 'Paste a YouTube, Instagram, or TikTok link (up to 3 min)',
  },
  list: {
    title: 'List',
    subtitle: 'Groceries for your recipes',
  },
  nav: {
    recipe: 'Recipe',
    preview: 'Preview',
    welcome: 'Welcome',
    resetPassword: 'Reset password',
    usage: 'Usage & support',
  },
};

const TARGETS = [
  {
    code: 'he',
    language: 'Hebrew (Israeli, everyday spoken Israeli Hebrew — not formal/literary)',
    extra: `CRITICAL Hebrew product terms:
- The tab/feature name "Snap" MUST be "סנאפ" (transliteration). NEVER "צילום", NEVER "צלמו", NEVER "לצלם" for this product action.
- "Snap a recipe" → natural like "סנאפ למתכון" (NOT camera verbs).
- "on Snap" → "בסנאפ".
- "Library" (the product area / tab) MUST be "ספרייה" — never leave the English word "Library".
- "takePhoto" CAN use camera language (צילום תמונה).
- Translate theme pack NAMES into natural Hebrew (ערפל, פירותי, חתולי, קסם, דרקולה, שמש, ליל כוכבים) — do not leave "Mist Drift" etc. in English.
- Prefer "רימיקס" over the English word "remix".
- Sound like a friendly Israeli cooking app — short, warm, day-to-day Hebrew.`,
  },
  {
    code: 'es',
    language: 'Spanish (neutral Latin American / international app Spanish, natural & friendly)',
    extra: `Keep "Snap" as the product feature name (do not translate the tab to "Capturar"). Phrases like "Snap a recipe" can stay "Snap a una receta" or similar natural product phrasing. Keep Pinch / Plus / Drift as-is. Translate "Library" (the app area) to "Biblioteca". Translate theme pack names into Spanish.`,
  },
  {
    code: 'ru',
    language: 'Russian (modern conversational UI Russian, friendly consumer app)',
    extra: `Keep "Snap" as the product feature name (Снап). e.g. tab "Снап", "Снап рецепт". Keep Pinch / Plus as-is.`,
  },
  {
    code: 'ar',
    language: 'Arabic (Modern Standard Arabic with a warm, everyday app tone — clear and natural, not stiff)',
    extra: `Keep "Snap" as the product feature name (سناب). Keep Pinch / Plus as-is. Prefer clear Gulf/Levant-friendly MSA that feels natural in apps.`,
  },
];

function collectPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...collectPaths(v, path));
    else out.push(path);
  }
  return out;
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function assertShape(translated, source, label) {
  const srcPaths = collectPaths(source);
  const missing = [];
  const extras = [];
  for (const p of srcPaths) {
    const v = getPath(translated, p);
    if (typeof v !== 'string' || !v.trim()) missing.push(p);
  }
  for (const p of collectPaths(translated)) {
    if (!srcPaths.includes(p)) extras.push(p);
  }
  if (missing.length || extras.length) {
    throw new Error(
      `${label} shape mismatch.\nMissing: ${missing.slice(0, 20).join(', ')}\nExtras: ${extras.slice(0, 20).join(', ')}`,
    );
  }
}

async function translateWithGemini(target) {
  const system = `You are a senior product localization writer for a cooking mobile app called Pinch.
Return ONLY valid JSON — the same nested object shape as the English input.
No markdown fences. No commentary.

Tone rules:
- Everyday, warm, human UI copy (like WhatsApp / Instagram settings — not a government form).
- Short sentences. Natural spoken rhythm.
- Keep placeholders EXACTLY: {{plan}} {{remaining}} {{limit}} {{price}} {{billingNote}} {{language}} {{mode}} {{saved}}
- Keep brand/product tokens: Pinch, Plus, Pinch Plus, Drift, TikTok, Instagram, YouTube, Library (as product area when natural).
- Do NOT translate code-like keys; only translate string VALUES.
- Preserve punctuation intent (questions, ellipses …).

${target.extra}`;

  const user = `Translate this Pinch UI catalog into ${target.language}.
Return the full JSON object with identical keys.

English catalog:
${JSON.stringify(english)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${target.code} failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (firstErr) {
    // Models sometimes emit soft hyphen / smart quotes — normalize and retry once.
    const normalized = cleaned
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u00A0/g, ' ')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(normalized);
    } catch (err) {
      throw new Error(
        `Invalid JSON for ${target.code}: ${firstErr.message}\n${cleaned.slice(0, 400)}`,
      );
    }
  }

  assertShape(parsed, english, target.code);

  // Hard guardrails for Hebrew Snap branding + common leftovers.
  if (target.code === 'he') {
    setPath(parsed, 'tabs.snap', 'סנאפ');
    setPath(parsed, 'tabs.library', 'ספרייה');
    if (!String(getPath(parsed, 'snap.title') || '').includes('סנאפ')) {
      setPath(parsed, 'snap.title', 'סנאפ למתכון');
    }
    if (!String(getPath(parsed, 'onboarding.ctaSnap') || '').includes('סנאפ')) {
      setPath(parsed, 'onboarding.ctaSnap', 'סנאפ למתכון');
    }
    const libraryFixes = {
      'recipe.goToLibrary': 'לספרייה',
      'onboarding.ctaLibrary': 'לספרייה',
      'library.title': 'המתכונים שלכם',
    };
    for (const [path, value] of Object.entries(libraryFixes)) {
      const current = String(getPath(parsed, path) || '');
      if (/Library/i.test(current) || !current.trim()) setPath(parsed, path, value);
    }
    const themeNames = {
      'themes.mist.name': 'ערפל',
      'themes.fruity.name': 'פירותי',
      'themes.cat.name': 'חתולי',
      'themes.potter.name': 'קסם',
      'themes.dracula.name': 'דרקולה',
      'themes.sunny.name': 'שמש',
      'themes.starry.name': 'ליל כוכבים',
    };
    for (const [path, value] of Object.entries(themeNames)) {
      const current = String(getPath(parsed, path) || '');
      if (/[A-Za-z]{3,}/.test(current)) setPath(parsed, path, value);
    }
    // Strip leftover English product jargon in Hebrew values.
    for (const path of collectPaths(parsed)) {
      if (path === 'settings.takePhoto') continue;
      let value = getPath(parsed, path);
      if (typeof value !== 'string') continue;
      let next = value
        .replace(/\bLibrary\b/g, 'ספרייה')
        .replace(/\bremixes\b/gi, 'רימיקסים')
        .replace(/\bremix\b/gi, 'רימיקס')
        .replace(/\(\s*רימיקס\s*\)/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (path === 'settings.chooseLibrary') {
        next = 'בחירה מהגלריה';
      }
      if (/צל[וֹ]?ם|לצלם|צלמו/.test(next) && /סנאפ|snap|מתכון|קישור|לשונית/i.test(path + next) === false) {
        // leave camera strings alone
      }
      if (path.startsWith('onboarding.') || path.startsWith('snap.') || path.startsWith('library.') || path.startsWith('recipe.noPreview')) {
        if (/צל[וֹ]?ם|לצלם|צלמו|צילום/.test(next) && !/תמונה/.test(next)) {
          next = next
            .replace(/צלמו מתכון/g, 'עשו סנאפ למתכון')
            .replace(/לצלם מתכון/g, 'לעשות סנאפ למתכון')
            .replace(/צילום מתכון/g, 'סנאפ למתכון')
            .replace(/בלשונית הצילום/g, 'בסנאפ')
            .replace(/לשונית הצילום/g, 'סנאפ');
        }
      }
      setPath(parsed, path, next);
    }
  }

  return parsed;
}

function toTsModule(obj) {
  return `export default ${JSON.stringify(obj, null, 2)} as const;\n`;
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const onlySet = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;

  if (!onlySet || onlySet.has('en')) {
    writeFileSync(join(root, 'src/i18n/locales/en.ts'), toTsModule(english), 'utf8');
    console.log('Wrote en.ts');
  }

  for (const target of TARGETS) {
    if (onlySet && !onlySet.has(target.code)) continue;
    console.log(`Translating ${target.code} with ${model}…`);
    let translated;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        translated = await translateWithGemini(target);
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Attempt ${attempt} failed for ${target.code}:`, err.message.slice(0, 180));
      }
    }
    if (!translated) throw lastErr;
    writeFileSync(join(root, `src/i18n/locales/${target.code}.ts`), toTsModule(translated), 'utf8');
    console.log(`Wrote ${target.code}.ts`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

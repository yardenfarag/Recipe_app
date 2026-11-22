// Server-rendered HTML for https://pinch-app.io/s/<token> (PIN-9, redesigned in PIN-110) and the
// public Hub recipe pages at https://pinch-app.io/r/<public_slug> (PIN-124).
// Pure functions only — no Cloudflare APIs — so vitest can cover them.
// Looks like the web app's recipe page (Night Market, PIN-160): the default theme pack's colours in light and dark,
// tiles with a hairline border, Space Grotesk headings and Inter text. The pages stay here, not in the Next.js app
// (ADR 031).

import { DEFAULT_THEME_PACK, ThemePacks, type ThemePackColors } from '../../../shared/constants/themes';

import { fill, isRtl, type PageLanguage, type PageStrings, stringsFor } from './strings';

export const SITE_URL = 'https://pinch-app.io';
export const APP_STORE_ID = '6796310453';
export const APP_STORE_URL = `https://apps.apple.com/us/app/pinch-recipe-library/id${APP_STORE_ID}`;
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pinch.myapp';
const ANDROID_PACKAGE = 'com.pinch.myapp';
const FALLBACK_IMAGE = `${SITE_URL}/og-image.jpg`;

/** Fields of the `recipe-share` "get" response that the page uses. */
export interface SharedRecipe {
  title: string;
  original_url?: string;
  platform?: string;
  image_url?: string;
  ingredients?: unknown;
  instructions?: unknown;
  servings?: number;
  estimated_time_minutes?: number;
  /** Total kcal for all servings. */
  calories?: number | null;
  /** PIN-80: grams for all servings. */
  nutrition?: { protein_g?: unknown; carbs_g?: unknown; fat_g?: unknown } | null;
  tags?: string[];
  source_language?: string;
}

interface IngredientLike {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

interface InstructionLike {
  step?: unknown;
  text?: unknown;
}

const PLATFORM_NAMES: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  youtube: 'YouTube',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON for a <script> block: escaping `<` means recipe text can't close the tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

/** 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4". */
export function formatQuantity(quantity: number): string {
  const whole = Math.floor(quantity);
  const part = quantity - whole;
  if (part < 0.02) return String(whole);
  const fraction = FRACTIONS.find(([value]) => Math.abs(part - value) < 0.02);
  if (fraction) return whole ? `${whole}${fraction[1]}` : fraction[1];
  return String(Math.round(quantity * 100) / 100);
}

interface IngredientParts {
  /** "1½", or empty when the recipe gives no amount. */
  amount: string;
  /** "cups flour", or "salt (to taste)". */
  rest: string;
}

function ingredientParts(raw: unknown): IngredientParts | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, quantity, unit } = raw as IngredientLike;
  if (typeof name !== 'string' || !name.trim()) return null;
  const unitText = typeof unit === 'string' ? unit.trim() : '';
  if (!(typeof quantity === 'number' && quantity > 0)) {
    // "to taste", "a pinch": no amount, so the note reads after the name.
    return { amount: '', rest: unitText ? `${name.trim()} (${unitText})` : name.trim() };
  }
  return { amount: formatQuantity(quantity), rest: [unitText, name.trim()].filter(Boolean).join(' ') };
}

export function formatIngredient(raw: unknown): string | null {
  const parts = ingredientParts(raw);
  return parts ? [parts.amount, parts.rest].filter(Boolean).join(' ') : null;
}

function ingredientList(recipe: SharedRecipe): IngredientParts[] {
  if (!Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients.map(ingredientParts).filter((parts): parts is IngredientParts => parts !== null);
}

function ingredientLines(recipe: SharedRecipe): string[] {
  return ingredientList(recipe).map((parts) => [parts.amount, parts.rest].filter(Boolean).join(' '));
}

/**
 * One ingredient row, as on the web app: tick box, amount, the rest. The amount is isolated left to right, so "1½"
 * stays "1½" inside a Hebrew or Arabic line.
 */
function ingredientHtml(parts: IngredientParts): string {
  const amount = parts.amount ? `<bdi dir="ltr">${escapeHtml(parts.amount)}</bdi>` : '';
  return `<li><label><input type="checkbox" /><span class="amount">${amount}</span><span class="name" dir="auto">${escapeHtml(parts.rest)}</span></label></li>`;
}

function instructionSteps(recipe: SharedRecipe): string[] {
  if (!Array.isArray(recipe.instructions)) return [];
  return (recipe.instructions as InstructionLike[])
    .filter((step) => step && typeof step.text === 'string' && step.text.trim())
    .sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0))
    .map((step) => (step.text as string).trim());
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function minutes(recipe: SharedRecipe): number | undefined {
  const value = recipe.estimated_time_minutes;
  return typeof value === 'number' && value > 0 ? Math.round(value) : undefined;
}

function servings(recipe: SharedRecipe): number | undefined {
  const value = recipe.servings;
  return typeof value === 'number' && value >= 1 ? Math.round(value) : undefined;
}

function platformName(recipe: SharedRecipe): string | undefined {
  return recipe.platform ? PLATFORM_NAMES[recipe.platform] : undefined;
}

/**
 * Calories in one serving, or nothing without calories. The same per-serving fix as the app's recipeCalories (a
 * "total" that is really one cookie of 48).
 */
function caloriesPerServing(recipe: SharedRecipe): number | undefined {
  const total = recipe.calories;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return undefined;
  const serves = servings(recipe) ?? 1;
  const looksPerServing = total / serves < 20 && total >= 40 && total <= 900 && serves >= 4;
  return Math.max(1, Math.round(looksPerServing ? total : total / serves));
}

/** Facts in the page language: "40 min", "Serves 4", "7 ingredients". */
function facts(recipe: SharedRecipe, s: PageStrings): string[] {
  const list: string[] = [];
  const time = minutes(recipe);
  if (time) list.push(fill(s.minutes, { n: time }));
  const serves = servings(recipe);
  if (serves) list.push(fill(s.serves, { n: serves }));
  const count = ingredientLines(recipe).length;
  if (count) list.push(fill(s.ingredientCount, { n: count }));
  return list;
}

/** The facts as small tiles, value over label, like the web app's recipe header: "40 min / Total time". */
function factTiles(recipe: SharedRecipe, s: PageStrings): string {
  const tiles: [string, string][] = [];
  const time = minutes(recipe);
  if (time) tiles.push([fill(s.minutes, { n: time }), s.factTime]);
  const serves = servings(recipe);
  if (serves) tiles.push([String(serves), s.factServings]);
  const count = ingredientList(recipe).length;
  if (count) tiles.push([String(count), s.ingredients]);
  const calories = caloriesPerServing(recipe);
  if (calories) tiles.push([`~${calories}`, s.factCalories]);
  if (!tiles.length) return '';
  return `<ul class="facts">${tiles.map(([value, label]) => `<li><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></li>`).join('')}</ul>`;
}

export function shareDescription(recipe: SharedRecipe, lang: PageLanguage = 'en'): string {
  const s = stringsFor(lang);
  const platform = platformName(recipe);
  const lead = platform ? fill(s.leadSaved, { platform }) : s.leadShared;
  const list = facts(recipe, s);
  return list.length ? `${lead} · ${list.join(' · ')}.` : `${lead}.`;
}

const gramsOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2500 ? value : null;

/**
 * schema.org NutritionInformation for one serving (PIN-80), the numbers the app shows: calories alone when there are
 * no macros, nothing without calories.
 */
export function nutritionJsonLd(recipe: SharedRecipe): Record<string, string> | undefined {
  const perServing = caloriesPerServing(recipe);
  if (!perServing) return undefined;
  const serves = servings(recipe) ?? 1;
  const data: Record<string, string> = {
    '@type': 'NutritionInformation',
    servingSize: '1 serving',
    calories: `${perServing} calories`,
  };
  const protein = gramsOf(recipe.nutrition?.protein_g);
  const carbs = gramsOf(recipe.nutrition?.carbs_g);
  const fat = gramsOf(recipe.nutrition?.fat_g);
  if (protein !== null && carbs !== null && fat !== null) {
    data.proteinContent = `${Math.round(protein / serves)} g`;
    data.carbohydrateContent = `${Math.round(carbs / serves)} g`;
    data.fatContent = `${Math.round(fat / serves)} g`;
  }
  return data;
}

export function recipeJsonLd(
  recipe: SharedRecipe,
  pageUrl: string,
  options: { description?: string; datePublished?: string } = {},
): Record<string, unknown> {
  const time = minutes(recipe);
  const serves = servings(recipe);
  const source = httpsUrl(recipe.original_url);
  const steps = instructionSteps(recipe);
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    url: pageUrl,
    image: [httpsUrl(recipe.image_url) ?? FALLBACK_IMAGE],
    description: options.description ?? shareDescription(recipe),
    recipeIngredient: ingredientLines(recipe),
    recipeInstructions: steps.map((text) => ({ '@type': 'HowToStep', text })),
  };
  if (time) data.totalTime = `PT${time}M`;
  if (serves) data.recipeYield = `${serves} servings`;
  const nutrition = nutritionJsonLd(recipe);
  if (nutrition) data.nutrition = nutrition;
  if (recipe.tags?.length) data.keywords = recipe.tags.join(', ');
  if (source) data.isBasedOn = source;
  if (options.datePublished) data.datePublished = options.datePublished;
  return data;
}

const LOGO_PATH =
  'M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3M9.5,6A1.5,1.5 0 0,1 11,7.5A1.5,1.5 0 0,1 9.5,9A1.5,1.5 0 0,1 8,7.5A1.5,1.5 0 0,1 9.5,6M6.5,10A1.5,1.5 0 0,1 8,11.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 5,11.5A1.5,1.5 0 0,1 6.5,10M11.5,11A1.5,1.5 0 0,1 13,12.5A1.5,1.5 0 0,1 11.5,14A1.5,1.5 0 0,1 10,12.5A1.5,1.5 0 0,1 11.5,11M16.5,13A1.5,1.5 0 0,1 18,14.5A1.5,1.5 0 0,1 16.5,16H16.5A1.5,1.5 0 0,1 15,14.5H15A1.5,1.5 0 0,1 16.5,13M11,16A1.5,1.5 0 0,1 12.5,17.5A1.5,1.5 0 0,1 11,19A1.5,1.5 0 0,1 9.5,17.5A1.5,1.5 0 0,1 11,16Z';
const APPLE_PATH =
  'M16.37 12.6c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.8-1.42-.15-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.2.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.59-.75 2.99-.75 1.4 0 1.79.75 3.01.72 1.24-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.53 1.26-2.6-.03-.01-2.42-.93-2.45-3.7zM14.08 5.85c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.03.08 2.07-.52 2.71-1.28z';
const PLAY_PATH =
  'M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z';

/** The default theme pack, which the web app also opens in. These pages have no theme picker. */
const PACK = ThemePacks[DEFAULT_THEME_PACK];

/** Theme pack colour → the CSS variable these pages use (named like the web app's Tailwind tokens). */
const COLOR_VARIABLES: [keyof ThemePackColors, string][] = [
  ['background', '--bg'],
  ['surface', '--surface'],
  ['backgroundElement', '--element'],
  ['text', '--text'],
  ['textSecondary', '--muted'],
  ['border', '--border'],
  ['primary', '--primary'],
  ['primarySoft', '--primary-soft'],
  ['onPrimary', '--on-primary'],
  ['primaryText', '--primary-text'],
];

function colorVariables(colors: ThemePackColors): string {
  return COLOR_VARIABLES.map(([key, variable]) => `${variable}:${colors[key] as string}`).join(';');
}

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const CYRILLIC = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';

/**
 * Inter and Space Grotesk, the web app's two faces, served by the site from /fonts (landing/fonts, SIL OFL). Neither
 * has Hebrew or Arabic, so those fall through to the system's fonts; Space Grotesk has no Cyrillic, so Russian
 * headings fall to Inter. Each file loads only when the page has a letter in its range.
 */
const FONT_FACES = (
  [
    ['Inter', 'inter-latin', LATIN],
    ['Inter', 'inter-latin-ext', LATIN_EXT],
    ['Inter', 'inter-cyrillic', CYRILLIC],
    ['Space Grotesk', 'space-grotesk-latin', LATIN],
    ['Space Grotesk', 'space-grotesk-latin-ext', LATIN_EXT],
  ] as const
)
  .map(
    ([family, file, range]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:300 700;font-display:swap;src:url(/fonts/${file}-wght-normal.woff2) format("woff2");unicode-range:${range}}`,
  )
  .join('\n');

// Sizes, corners and spacing follow web/components/ui (Tile, Button) and web/components/recipe (RecipeHeader,
// IngredientsPanel, StepsPanel). Breakpoints are the web app's: 768 (md), 1024 (lg), 1280 (xl). Store and app buttons
// switch at 860, as before, so tablets keep "Open in Pinch".
const STYLES = `
${FONT_FACES}
:root{${colorVariables(PACK.light)};color-scheme:light;--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Hebrew","Noto Sans Arabic",Arial,sans-serif;--display:"Space Grotesk",var(--sans)}
@media (prefers-color-scheme:dark){:root{${colorVariables(PACK.dark)};color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:16px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
h1,h2{font-family:var(--display);font-weight:700;letter-spacing:-.015em}
[dir=rtl] h1,[dir=rtl] h2{letter-spacing:normal}
a{color:inherit}
::selection{background:var(--primary-soft);color:var(--text)}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:16px}
.brand{display:inline-flex;align-items:center;gap:8px;font:700 22px/1 var(--display);letter-spacing:-.02em;text-decoration:none}
.brand svg{width:28px;height:28px;fill:var(--primary)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:56px;padding:0 24px;border:1px solid transparent;border-radius:16px;font-size:17px;font-weight:600;line-height:1.2;text-align:center;text-decoration:none;transition:filter .15s,background-color .15s}
.btn-sm{height:40px;padding:0 16px;border-radius:12px;font-size:14px}
.btn-primary{background:var(--primary);color:var(--on-primary);font-family:var(--display);font-weight:700}
.btn-primary:hover{filter:brightness(1.05)}
.btn-outline{border-color:var(--border);background:var(--surface);color:var(--text)}
.btn-outline:hover{background:var(--element)}
.btn-store{min-width:210px;background:var(--text);color:var(--bg)}
.btn-store svg{width:22px;height:22px;fill:currentColor}
.tile{border:1px solid var(--border);border-radius:28px;background:var(--surface)}
.hero{display:flex;flex-direction:column;gap:16px}
.photo{position:relative;margin:0;min-height:260px;border-radius:28px;overflow:hidden;background:var(--element)}
.photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.details{display:flex;flex-direction:column;gap:14px;min-width:0;padding:20px}
.eyebrow{display:inline-flex;width:fit-content;max-width:100%;margin:0;padding:6px 10px;border-radius:8px;background:var(--primary-soft);color:var(--primary-text);font:700 11px/1.1 var(--display);letter-spacing:.08em;text-transform:uppercase}
[dir=rtl] .eyebrow{letter-spacing:normal}
h1{margin:0;font-size:28px;line-height:.95;letter-spacing:-.035em;text-wrap:balance;overflow-wrap:anywhere}
.t-s h1{font-size:40px}
.t-m h1{font-size:32px}
[dir=rtl] h1{line-height:1.15;letter-spacing:normal}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;list-style:none;margin:0;padding:0}
.facts li{display:flex;flex-direction:column;gap:2px;min-width:0;padding:10px;border-radius:14px;background:var(--element)}
.facts b{font:700 17px/1.2 var(--display);text-wrap:balance;overflow-wrap:anywhere}
.facts span{color:var(--muted);font-size:11px;font-weight:600;line-height:1.35}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.details .actions{display:none;margin-top:auto;padding-top:4px}
.details .actions .btn{flex:1 1 12rem}
.source{margin:0;font-size:14px}
.source a{color:var(--primary-text);font-weight:600;text-decoration:none;text-underline-offset:4px}
.source a:hover{text-decoration:underline}
.content{display:grid;align-items:start;gap:16px;margin-top:20px}
h2{margin:0;font-size:22px;line-height:1.2}
.ingredients{display:flex;flex-direction:column;gap:12px;min-width:0;padding:20px}
.ingredients ul{display:grid;grid-template-columns:auto fit-content(9rem) minmax(0,1fr);column-gap:12px;list-style:none;margin:0;padding:0}
.ingredients li{grid-column:1/-1;display:grid;grid-template-columns:subgrid;border-bottom:1px solid var(--border)}
.ingredients li:last-child{border-bottom:0}
.ingredients label{grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center;min-height:46px;padding:8px 0;cursor:pointer}
.ingredients input{width:20px;height:20px;margin:0;accent-color:var(--primary);cursor:pointer}
.ingredients .amount{color:var(--primary-text);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.ingredients .name{font-size:15px;overflow-wrap:anywhere}
.ingredients input:checked~.amount{opacity:.6}
.ingredients input:checked~.name{color:var(--muted);text-decoration:line-through}
.steps{min-width:0}
.steps ol{display:flex;flex-direction:column;gap:12px;list-style:none;margin:12px 0 0;padding:0;counter-reset:step}
.steps li{counter-increment:step;display:flex;align-items:flex-start;gap:14px;padding:16px;border:1px solid var(--border);border-radius:24px;background:var(--surface)}
.steps li::before{content:counter(step);flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--element);font:700 18px/1 var(--display);font-variant-numeric:tabular-nums}
.steps li span{flex:1;min-width:0;max-width:65ch;padding-top:7px;text-wrap:pretty}
.steps .credit{margin:12px 0 0;color:var(--muted);font-size:14px}
.promo{margin-top:40px;padding:32px 20px;border-radius:28px;background:var(--primary);color:var(--on-primary);text-align:center}
.promo svg.logo{width:44px;height:44px;fill:currentColor}
.promo h2{margin:12px 0 8px;font-size:28px;line-height:1.1}
.promo p{max-width:560px;margin:0 auto;opacity:.85}
.promo .actions{justify-content:center;margin-top:24px}
.promo .btn-store{background:var(--on-primary);color:var(--primary)}
.notice{max-width:560px;margin:32px auto 0;padding:32px 24px;text-align:center}
.notice h1{font-size:32px;line-height:1.1}
.notice p{color:var(--muted)}
.notice .actions{justify-content:center;margin-top:20px}
footer{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-top:48px;padding:24px 16px 120px;border-top:1px solid var(--border);color:var(--muted);font-size:14px}
footer a{text-decoration:none}
footer a:hover{color:var(--text)}
.sticky{position:fixed;inset-inline:0;bottom:0;z-index:5;display:flex;gap:10px;padding:20px 16px max(env(safe-area-inset-bottom),16px);background:linear-gradient(color-mix(in srgb,var(--bg) 0%,transparent),var(--bg) 35%)}
.sticky .btn{flex:1;min-width:0;height:54px;padding:0 12px}
.desktop-only{display:none}
@media (min-width:640px){.wrap{padding:0 24px}}
@media (min-width:768px){
  .hero{flex-direction:row;flex-wrap:wrap}
  .photo{flex:7 1 520px;min-height:460px}
  .details{flex:5 1 380px;gap:18px;padding:32px}
  .eyebrow{font-size:12px}
  h1{font-size:36px}
  .t-s h1{font-size:60px}
  .t-m h1{font-size:48px}
  .facts{gap:10px}
  .facts li{padding:12px 14px;border-radius:16px}
  .facts b{font-size:22px}
  .facts span{font-size:12px}
  .content{margin-top:24px}
  h2{font-size:26px}
  .ingredients{padding:26px}
  .ingredients .amount,.ingredients .name{font-size:16px}
  .steps ol{margin-top:16px}
  .steps li{gap:18px;padding:22px 24px}
  .steps li::before{width:44px;height:44px;border-radius:14px;font-size:20px}
  .steps li span{font-size:17px}
  .promo{padding:48px 32px}
  .promo h2{font-size:32px}
}
@media (min-width:860px){
  /* Below this the bar at the bottom of the screen holds the two buttons. */
  .details .actions{display:flex}
  .sticky{display:none}
  footer{padding-bottom:32px}
  .mobile-only{display:none}
  .desktop-only{display:inline-flex}
}
@media (min-width:1024px){
  .content.both{grid-template-columns:minmax(0,4fr) minmax(0,7fr)}
  .ingredients{position:sticky;top:24px;max-height:calc(100dvh - 48px);overflow-y:auto;overscroll-behavior:contain}
}
@media (min-width:1280px){
  h1{font-size:44px}
  .t-s h1{font-size:72px}
  .t-m h1{font-size:56px}
}
@media print{
  :root{${colorVariables(PACK.light)};color-scheme:light}
  .sticky,.actions,.promo,header,footer{display:none}
  .ingredients{position:static;max-height:none}
}
`;

/** Headlines shrink as titles grow, like the web app's (RecipeHeader): short, medium, long. */
function titleSizeClass(title: string): string {
  return title.length <= 16 ? 't-s' : title.length <= 34 ? 't-m' : '';
}

function logo(className = ''): string {
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="${LOGO_PATH}"/></svg>`;
}

function storeButtons(s: PageStrings): string {
  return `<a class="btn btn-store" data-store="ios" href="${APP_STORE_URL}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${APPLE_PATH}"/></svg>${escapeHtml(s.appStore)}</a>
          <a class="btn btn-store" data-store="android" href="${PLAY_STORE_URL}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PLAY_PATH}"/></svg>${escapeHtml(s.googlePlay)}</a>`;
}

/** App route for a share token: `s/<token>`. Hub cards use `hub/<id>`. */
function shareRoute(token: string): string {
  return `s/${encodeURIComponent(token)}`;
}

/** Custom-scheme link: opens the app if installed. The script below adds store fallbacks. */
function appLink(route: string): string {
  return `pinch://${route}`;
}

function webAppLink(route: string): string {
  return `/app/${route}`;
}

/**
 * "Open in Pinch" without a dead end. Android gets an intent:// URL that falls back to Google
 * Play by itself. iOS tries the app and goes to the App Store if the page is still showing.
 * Desktop has no app, so those buttons are hidden by CSS and the web app is offered instead.
 * Installed apps usually never see this page: universal links / App Links open them directly.
 */
function openAppScript(route: string): string {
  const scheme = appLink(route);
  const intent = `intent://${route}#Intent;scheme=pinch;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
  return `<script>
(function () {
  var ua = navigator.userAgent || '';
  var android = /Android/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var links = document.querySelectorAll('[data-open-app]');
  for (var i = 0; i < links.length; i++) {
    if (android) links[i].setAttribute('href', ${JSON.stringify(intent)});
    else if (ios) links[i].addEventListener('click', function (event) {
      event.preventDefault();
      var started = Date.now();
      window.location.href = ${JSON.stringify(scheme)};
      setTimeout(function () {
        if (!document.hidden && Date.now() - started < 3000) window.location.href = ${JSON.stringify(APP_STORE_URL)};
      }, 1500);
    });
  }
  // Show only the store that fits the phone.
  var hide = android ? 'ios' : ios ? 'android' : '';
  if (hide) {
    var stores = document.querySelectorAll('[data-store="' + hide + '"]');
    for (var j = 0; j < stores.length; j++) stores[j].style.display = 'none';
  }
})();
</script>`;
}

function page(options: {
  lang: PageLanguage;
  title: string;
  description: string;
  canonical?: string;
  image: string;
  imageAlt?: string;
  appArgument?: string;
  jsonLd?: Record<string, unknown>;
  /** Share pages and error pages stay out of search. Only full Hub recipe pages are indexed. */
  indexable?: boolean;
  body: string;
}): string {
  const { lang, title, description, canonical, image, imageAlt, appArgument, jsonLd, indexable, body } = options;
  const s = stringsFor(lang);
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isRtl(lang) ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex'}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${PACK.light.background}" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${PACK.dark.background}" />
    <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Pinch" />
    <meta property="og:locale" content="${lang}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    ${imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}${appArgument ? `, app-argument=${escapeHtml(appArgument)}` : ''}" />
    ${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ''}
    <style>${STYLES}</style>
  </head>
  <body>
    <header class="top wrap">
      <a class="brand" href="/">${logo()}Pinch</a>
      <a class="btn btn-outline btn-sm" href="#get">${escapeHtml(s.getApp)}</a>
    </header>
${body}
    <footer>
      <a href="/">Pinch</a>
      <a href="/privacy.html">${escapeHtml(s.privacy)}</a>
      <a href="/terms.html">${escapeHtml(s.terms)}</a>
      <span>© ${new Date().getFullYear()} Pinch</span>
    </footer>
  </body>
</html>
`;
}

function promo(s: PageStrings): string {
  return `      <section id="get" class="promo">
        ${logo('logo')}
        <h2>${escapeHtml(s.promoTitle)}</h2>
        <p>${escapeHtml(s.promoBody)}</p>
        <div class="actions">
          ${storeButtons(s)}
        </div>
      </section>`;
}

function sourceName(recipe: SharedRecipe): string | undefined {
  const source = httpsUrl(recipe.original_url);
  return platformName(recipe) ?? (source ? new URL(source).hostname.replace(/^www\./, '') : undefined);
}

/** Title, photo, facts, buttons, ingredients and steps: shared by share pages and Hub pages. */
function recipeBody(
  recipe: SharedRecipe,
  s: PageStrings,
  options: { route: string; eyebrow: string; creditNote?: string },
): string {
  const { route, eyebrow, creditNote } = options;
  const photo = httpsUrl(recipe.image_url);
  const ingredients = ingredientList(recipe);
  const steps = instructionSteps(recipe);
  const source = httpsUrl(recipe.original_url);
  const platform = platformName(recipe);
  const titleSize = titleSizeClass(recipe.title);

  const sourceLine = source
    ? `<p class="source"><a href="${escapeHtml(source)}" rel="nofollow noopener" target="_blank">${escapeHtml(
        platform ? fill(s.originalOn, { platform }) : fill(s.originalAt, { site: new URL(source).hostname.replace(/^www\./, '') }),
      )} ↗</a></p>`
    : '';

  // No photo, no photo tile: the details take the whole row, as on the web app. A photo that fails to load removes
  // its tile the same way.
  return `    <main class="wrap">
      <article>
        <div class="hero">
          ${
            photo
              ? `<figure class="photo"><img src="${escapeHtml(photo)}" alt="${escapeHtml(recipe.title)}" fetchpriority="high" onerror="this.parentNode.remove()" /></figure>`
              : ''
          }
          <div class="tile details${titleSize ? ` ${titleSize}` : ''}">
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h1 dir="auto">${escapeHtml(recipe.title)}</h1>
            ${factTiles(recipe, s)}
            ${sourceLine}
            <div class="actions">
              <a class="btn btn-primary mobile-only" data-open-app href="${appLink(route)}">${escapeHtml(s.openInApp)}</a>
              <a class="btn btn-primary desktop-only" href="${webAppLink(route)}">${escapeHtml(s.saveOnWeb)}</a>
              <a class="btn btn-outline" href="#get">${escapeHtml(s.getApp)}</a>
            </div>
          </div>
        </div>
        <div class="content${ingredients.length && steps.length ? ' both' : ''}">
          ${
            ingredients.length
              ? `<section class="tile ingredients">
            <h2>${escapeHtml(s.ingredients)}</h2>
            <ul>${ingredients.map(ingredientHtml).join('')}</ul>
          </section>`
              : ''
          }
          ${
            steps.length
              ? `<section class="steps">
            <h2>${escapeHtml(s.steps)}</h2>
            <ol>${steps.map((text) => `<li><span dir="auto">${escapeHtml(text)}</span></li>`).join('')}</ol>${
              creditNote ? `
            <p class="credit">${escapeHtml(creditNote)}</p>` : ''
            }
          </section>`
              : ''
          }
        </div>
      </article>
${promo(s)}
    </main>
    <div class="sticky">
      <a class="btn btn-primary" data-open-app href="${appLink(route)}">${escapeHtml(s.openInApp)}</a>
      <a class="btn btn-outline" href="#get">${escapeHtml(s.getApp)}</a>
    </div>
    ${openAppScript(route)}`;
}

export function renderSharePage(recipe: SharedRecipe, token: string, lang: PageLanguage = 'en'): string {
  const s = stringsFor(lang);
  const pageUrl = `${SITE_URL}/s/${encodeURIComponent(token)}`;
  const photo = httpsUrl(recipe.image_url);
  return page({
    lang,
    title: `${recipe.title} · Pinch`,
    description: shareDescription(recipe, lang),
    canonical: pageUrl,
    image: photo ?? FALLBACK_IMAGE,
    imageAlt: recipe.title,
    appArgument: pageUrl,
    jsonLd: recipeJsonLd(recipe, pageUrl),
    body: recipeBody(recipe, s, { route: shareRoute(token), eyebrow: s.sharedWithYou }),
  });
}

/** A Hub card as the public recipe page reads it from `recipe_cards` (PIN-124). */
export interface HubRecipe extends SharedRecipe {
  id: string;
  public_slug: string;
  extraction_status?: string;
  created_at?: string;
  updated_at?: string;
}

/** "Recipe from TikTok · 15 min · Serves 2 · 3 ingredients." */
export function hubDescription(recipe: SharedRecipe, lang: PageLanguage = 'en'): string {
  const s = stringsFor(lang);
  const source = sourceName(recipe);
  const lead = source ? fill(s.creditFrom, { source }) : s.leadShared;
  const list = facts(recipe, s);
  return list.length ? `${lead} · ${list.join(' · ')}.` : `${lead}.`;
}

export function hubPageUrl(recipe: Pick<HubRecipe, 'public_slug'>): string {
  return `${SITE_URL}/r/${encodeURIComponent(recipe.public_slug)}`;
}

/** Public page for a Hub recipe. `indexable` is false for thin recipes (see isIndexable in hub.ts). */
export function renderHubPage(recipe: HubRecipe, lang: PageLanguage, indexable: boolean): string {
  const s = stringsFor(lang);
  const pageUrl = hubPageUrl(recipe);
  const photo = httpsUrl(recipe.image_url);
  const source = sourceName(recipe);
  const description = hubDescription(recipe, lang);
  const datePublished = recipe.created_at?.slice(0, 10);
  return page({
    lang,
    title: `${recipe.title} · Pinch`,
    description,
    canonical: pageUrl,
    image: photo ?? FALLBACK_IMAGE,
    imageAlt: recipe.title,
    appArgument: pageUrl,
    jsonLd: recipeJsonLd(recipe, pageUrl, { description, datePublished }),
    indexable,
    body: recipeBody(recipe, s, {
      route: `hub/${encodeURIComponent(recipe.id)}`,
      eyebrow: source ? fill(s.creditFrom, { source }) : s.leadShared,
      creditNote: source ? fill(s.creditNote, { source }) : undefined,
    }),
  });
}

export function renderNotFoundPage(lang: PageLanguage = 'en', kind: 'share' | 'hub' = 'share'): string {
  const s = stringsFor(lang);
  const message = kind === 'hub' ? s.hubNotFoundBody : s.notFoundBody;
  return page({
    lang,
    title: `${s.notFoundTitle} · Pinch`,
    description: message,
    image: FALLBACK_IMAGE,
    body: `    <main class="wrap">
      <div class="tile notice">
        <h1>${escapeHtml(s.notFoundTitle)}</h1>
        <p>${escapeHtml(message)}</p>
        <div class="actions"><a class="btn btn-primary" href="/">${escapeHtml(s.goHome)}</a></div>
      </div>
${promo(s)}
    </main>`,
  });
}

export function renderUnavailablePage(token: string, lang: PageLanguage = 'en'): string {
  const s = stringsFor(lang);
  return page({
    lang,
    title: `${s.unavailableTitle} · Pinch`,
    description: s.unavailableBody,
    image: FALLBACK_IMAGE,
    appArgument: `${SITE_URL}/s/${encodeURIComponent(token)}`,
    body: `    <main class="wrap">
      <div class="tile notice">
        <h1>${escapeHtml(s.unavailableTitle)}</h1>
        <p>${escapeHtml(s.unavailableBody)}</p>
        <div class="actions">
          <a class="btn btn-primary mobile-only" data-open-app href="${appLink(shareRoute(token))}">${escapeHtml(s.openInApp)}</a>
          <a class="btn btn-outline" href="${webAppLink(shareRoute(token))}">${escapeHtml(s.saveOnWeb)}</a>
        </div>
      </div>
${promo(s)}
    </main>
    ${openAppScript(shareRoute(token))}`,
  });
}

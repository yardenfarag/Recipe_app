// Server-rendered HTML for https://pinch-app.io/s/<token> (PIN-9, redesigned in PIN-110) and the
// public Hub recipe pages at https://pinch-app.io/r/<public_slug> (PIN-124).
// Pure functions only — no Cloudflare APIs — so vitest can cover them.
// Looks like the landing page (landing/site.css): night background, Pinch pink, glass cards.

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

/** The amount is isolated left to right, so "1½" stays "1½" inside a Hebrew or Arabic line. */
function ingredientHtml(parts: IngredientParts): string {
  const amount = parts.amount ? `<bdi dir="ltr">${escapeHtml(parts.amount)}</bdi> ` : '';
  return `${amount}${escapeHtml(parts.rest)}`;
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
 * no macros, nothing without calories. Same per-serving fix as the app's recipeCalories (a "total" that is really one
 * cookie of 48).
 */
export function nutritionJsonLd(recipe: SharedRecipe): Record<string, string> | undefined {
  const total = recipe.calories;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return undefined;
  const serves = servings(recipe) ?? 1;
  const looksPerServing = total / serves < 20 && total >= 40 && total <= 900 && serves >= 4;
  const perServing = Math.max(1, Math.round(looksPerServing ? total : total / serves));
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

const STYLES = `
:root{--pink:#c45b7a;--pink-button:#b24f6d;--pink-bright:#f0a8c4;--night:#070508;--cream:#f7f2f4;--muted:#c3b0b8;--line:rgba(232,168,188,.22);--glass:rgba(255,255,255,.045);--well:rgba(196,91,122,.2);color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--cream);line-height:1.55;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;background:radial-gradient(560px 560px at 0% 0%,rgba(196,91,122,.28),transparent 70%),radial-gradient(440px 440px at 100% 8%,rgba(240,168,196,.12),transparent 70%),linear-gradient(#140910,var(--night) 42%,#09070a);background-color:var(--night);background-attachment:fixed}
:lang(ar){letter-spacing:0!important}
a{color:inherit}
:focus-visible{outline:2px solid var(--pink-bright);outline-offset:3px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:24px}
.brand{display:inline-flex;align-items:center;gap:10px;font-size:22px;font-weight:700;letter-spacing:-.4px;text-decoration:none}
.brand svg{width:28px;height:28px;fill:var(--pink)}
.pill{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border:1px solid var(--line);border-radius:999px;background:var(--glass);color:var(--muted);font-size:14px;font-weight:600;text-decoration:none}
.pill:hover{color:var(--cream)}
.hero{display:grid;gap:24px;margin-top:28px}
.photo{margin:0;aspect-ratio:4/3;border-radius:24px;overflow:hidden;border:1px solid var(--line);background:linear-gradient(135deg,#2a1420,#140910);display:grid;place-items:center;box-shadow:0 24px 60px -24px rgba(0,0,0,.8)}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.photo svg{width:72px;height:72px;fill:var(--pink);opacity:.8}
.no-photo .photo{aspect-ratio:auto;height:112px}
.no-photo .photo svg{width:48px;height:48px}
.eyebrow{margin:0;color:var(--pink-bright);font-size:14px;font-weight:700;letter-spacing:.2px}
h1{margin:8px 0 0;font-size:clamp(30px,5vw,46px);line-height:1.1;letter-spacing:-.8px;overflow-wrap:anywhere}
.facts{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:16px 0 0;padding:0}
.facts li{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--glass);color:var(--muted);font-size:14px;font-weight:600}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 22px;border-radius:14px;font-weight:700;font-size:16px;text-decoration:none;border:1px solid transparent}
.btn:hover{opacity:.9}
.btn-primary{background:var(--pink-button);color:#fff}
.btn-ghost{border-color:var(--line);background:var(--glass)}
.btn-store{background:#fff;color:#000;min-width:200px}
.btn-store svg{width:22px;height:22px;fill:currentColor}
.source{margin:18px 0 0;color:var(--muted);font-size:15px}
.source a{color:var(--pink-bright)}
.content{display:grid;gap:20px;margin-top:40px}
.card{border:1px solid var(--line);border-radius:22px;background:var(--glass);padding:22px}
h2{margin:0 0 14px;font-size:22px;letter-spacing:-.3px}
.ingredients ul{list-style:none;margin:0;padding:0}
.ingredients li{border-top:1px solid var(--line)}
.ingredients li:first-child{border-top:0}
.ingredients label{display:flex;gap:12px;align-items:flex-start;padding:10px 0;cursor:pointer}
.ingredients input{appearance:none;-webkit-appearance:none;flex:none;width:20px;height:20px;margin:2px 0 0;border:2px solid var(--pink);border-radius:6px;display:grid;place-items:center;cursor:pointer}
.ingredients input:checked{background:var(--pink)}
.ingredients input:checked::after{content:"";width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg)}
.ingredients input:checked+span{color:var(--muted);text-decoration:line-through}
.steps ol{list-style:none;margin:0;padding:0;counter-reset:step}
.steps li{counter-increment:step;display:grid;grid-template-columns:36px 1fr;gap:14px;padding:12px 0;border-top:1px solid var(--line)}
.steps li:first-child{border-top:0;padding-top:0}
.steps .credit{margin:14px 0 0;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
.steps li::before{content:counter(step);display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:var(--well);color:var(--pink-bright);font-weight:800}
.promo{margin-top:48px;text-align:center;padding:36px 22px;background:linear-gradient(160deg,rgba(196,91,122,.22),rgba(255,255,255,.03))}
.promo svg.logo{width:44px;height:44px;fill:var(--pink)}
.promo h2{margin:12px 0 8px;font-size:clamp(24px,4vw,32px)}
.promo p{margin:0 auto;max-width:560px;color:var(--muted)}
.promo .actions{justify-content:center}
footer{margin-top:56px;padding:24px 20px 120px;border-top:1px solid var(--line);color:var(--muted);font-size:14px;display:flex;flex-wrap:wrap;gap:16px;justify-content:center}
footer a{text-decoration:none}
footer a:hover{color:var(--cream)}
.sticky{position:fixed;inset-inline:0;bottom:0;z-index:5;display:flex;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(12,8,10,.92);border-top:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.sticky .btn{flex:1;min-height:48px;padding:0 12px}
.notice{max-width:560px;margin:72px auto 0;text-align:center}
.notice p{color:var(--muted)}
.notice .actions{justify-content:center}
.desktop-only{display:none}
@media (min-width:860px){
  .hero{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;gap:48px;margin-top:40px}
  .no-photo .photo{aspect-ratio:4/3;height:auto}
  .content{grid-template-columns:minmax(280px,.8fr) minmax(0,1.2fr);align-items:start;gap:28px;margin-top:56px}
  .ingredients{position:sticky;top:24px}
  .sticky{display:none}
  footer{padding-bottom:32px}
  .mobile-only{display:none}
  .desktop-only{display:inline-flex}
}
@media print{body{background:#fff;color:#000}.sticky,.actions,.promo,header,footer{display:none}.card{border-color:#ccc}}
`;

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
  const bigImage = image !== FALLBACK_IMAGE;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isRtl(lang) ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex'}" />
    <meta name="theme-color" content="#140910" />
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
  <body${bigImage ? '' : ' class="no-photo"'}>
    <header class="top wrap">
      <a class="brand" href="/">${logo()}Pinch</a>
      <a class="pill" href="#get">${escapeHtml(s.getApp)}</a>
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
  return `      <section id="get" class="card promo">
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
  const factList = facts(recipe, s);

  const sourceLine = source
    ? `<p class="source"><a href="${escapeHtml(source)}" rel="nofollow noopener" target="_blank">${escapeHtml(
        platform ? fill(s.originalOn, { platform }) : fill(s.originalAt, { site: new URL(source).hostname.replace(/^www\./, '') }),
      )} ↗</a></p>`
    : '';

  return `    <main class="wrap">
      <article>
        <div class="hero">
          <figure class="photo">${
            photo
              ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(recipe.title)}" fetchpriority="high" />`
              : logo()
          }</figure>
          <div>
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h1 dir="auto">${escapeHtml(recipe.title)}</h1>
            ${factList.length ? `<ul class="facts">${factList.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>` : ''}
            <div class="actions">
              <a class="btn btn-primary mobile-only" data-open-app href="${appLink(route)}">${escapeHtml(s.openInApp)}</a>
              <a class="btn btn-primary desktop-only" href="${webAppLink(route)}">${escapeHtml(s.saveOnWeb)}</a>
              <a class="btn btn-ghost" href="#get">${escapeHtml(s.getApp)}</a>
            </div>
            ${sourceLine}
          </div>
        </div>
        <div class="content">
          ${
            ingredients.length
              ? `<section class="card ingredients">
            <h2>${escapeHtml(s.ingredients)}</h2>
            <ul>${ingredients.map((parts) => `<li><label><input type="checkbox" /><span dir="auto">${ingredientHtml(parts)}</span></label></li>`).join('')}</ul>
          </section>`
              : ''
          }
          ${
            steps.length
              ? `<section class="card steps">
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
      <a class="btn btn-ghost" href="#get">${escapeHtml(s.getApp)}</a>
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
      <div class="notice">
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
      <div class="notice">
        <h1>${escapeHtml(s.unavailableTitle)}</h1>
        <p>${escapeHtml(s.unavailableBody)}</p>
        <div class="actions">
          <a class="btn btn-primary mobile-only" data-open-app href="${appLink(shareRoute(token))}">${escapeHtml(s.openInApp)}</a>
          <a class="btn btn-ghost" href="${webAppLink(shareRoute(token))}">${escapeHtml(s.saveOnWeb)}</a>
        </div>
      </div>
${promo(s)}
    </main>
    ${openAppScript(shareRoute(token))}`,
  });
}

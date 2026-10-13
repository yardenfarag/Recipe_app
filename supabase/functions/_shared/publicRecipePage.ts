/**
 * Public hub recipe pages. No Deno APIs — vitest can import this file.
 * Pages show Pinch's structured recipe and a link to the original post.
 * They do not render creator photos or video.
 */

export const PUBLIC_RECIPE_ORIGIN = 'https://r.pinch-app.io';
export const PINCH_APP_ORIGIN = 'https://pinch-app.io';
export const PINCH_APP_STORE_URL =
  'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';

/** Columns the public page is allowed to read. Media stays out. */
export const PUBLIC_RECIPE_COLUMNS =
  'id, public_slug, title, original_url, platform, ingredients, instructions, servings, calories, estimated_time_minutes, tags, source_language, extraction_status';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RTL_LANGUAGES = new Set(['he', 'ar', 'fa', 'ur']);

const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export type PublicRecipeRoute =
  | { kind: 'home' }
  | { kind: 'robots' }
  | { kind: 'sitemap' }
  | { kind: 'recipe'; slug: string }
  | { kind: 'unknown' };

export interface PublicAmount {
  quantity: number;
  unit: string;
}

export interface PublicInstruction {
  text: string;
}

export interface PublicRecipePageInput {
  id: string;
  slug: string;
  title: string;
  originalUrl: string | null;
  platform: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories: number | null;
  estimatedTimeMinutes: number | null;
  tags: string[];
  sourceLanguage: string | null;
  origin?: string;
  indexable?: boolean;
}

export interface PublicRecipeDocument {
  status: number;
  contentType: string;
  indexable: boolean;
  body: string;
  cacheControl: string;
}

interface PageAmount {
  quantity: number;
  unit: string;
  system: 'spoons' | 'metric' | 'only';
}

interface PageIngredient {
  name: string;
  amounts: PageAmount[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/** Self-contained so the public page can embed this function's source. */
export function formatPublicAmount(quantity: number, unit: string): string {
  const nice: Array<[number, string]> = [
    [0.125, '⅛'],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.375, '⅜'],
    [0.5, '½'],
    [0.625, '⅝'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
    [0.875, '⅞'],
  ];
  const displayUnit = unit.trim();
  if (!Number.isFinite(quantity) || quantity <= 0) return displayUnit;
  const key = displayUnit.toLowerCase();
  if (key === 'g' || key === 'kg' || key === 'ml' || key === 'l' || key === 'liter' || key === 'litre') {
    const rounded = quantity >= 100 ? Math.round(quantity) : Math.round(quantity * 100) / 100;
    return `${rounded} ${displayUnit}`.trim();
  }
  const whole = Math.floor(quantity);
  const remainder = quantity - whole;
  let bestWhole = whole;
  let bestGlyph = '';
  let bestDiff = remainder;
  if (1 - remainder < bestDiff) {
    bestDiff = 1 - remainder;
    bestWhole = whole + 1;
  }
  for (let i = 0; i < nice.length; i += 1) {
    const diff = Math.abs(remainder - nice[i][0]);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestGlyph = nice[i][1];
      bestWhole = whole;
    }
  }
  if (bestWhole === 0 && !bestGlyph) bestGlyph = '⅛';
  const amount = bestWhole > 0 ? `${bestWhole}${bestGlyph}` : bestGlyph;
  return `${amount} ${displayUnit}`.trim();
}

export function parsePublicRecipePath(pathname: string): PublicRecipeRoute {
  const clean = pathname.split('?')[0] ?? '';
  const marker = '/public-recipe';
  const at = clean.lastIndexOf(marker);
  const rest = (at === -1 ? clean : clean.slice(at + marker.length)).replace(/\/+$/, '');
  const path = rest.replace(/^\//, '');
  if (!path) return { kind: 'home' };
  if (path === 'robots.txt') return { kind: 'robots' };
  if (path === 'sitemap.xml') return { kind: 'sitemap' };
  if (SLUG_PATTERN.test(path) && path.length <= 80) return { kind: 'recipe', slug: path };
  return { kind: 'unknown' };
}

export function publicRecipeHeaders(doc: Pick<PublicRecipeDocument, 'contentType' | 'indexable' | 'cacheControl'>): Headers {
  const headers = new Headers();
  headers.set('Content-Type', doc.contentType);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', PAGE_CSP);
  headers.set('X-Robots-Tag', doc.indexable ? 'index, follow' : 'noindex, nofollow');
  headers.set('Cache-Control', doc.cacheControl);
  return headers;
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https:\/\/[^\s]+$/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readAmount(value: unknown): PublicAmount | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { quantity?: unknown; unit?: unknown };
  if (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity) || record.quantity <= 0) {
    return null;
  }
  return {
    quantity: record.quantity,
    unit: typeof record.unit === 'string' ? record.unit.trim() : '',
  };
}

function sameAmount(a: PublicAmount, b: PublicAmount): boolean {
  return Math.abs(a.quantity - b.quantity) < 0.001 && a.unit.toLowerCase() === b.unit.toLowerCase();
}

function pageIngredients(value: unknown): PageIngredient[] {
  if (!Array.isArray(value)) return [];
  const rows: PageIngredient[] = [];
  for (const item of value.slice(0, 80)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; quantity?: unknown; unit?: unknown; spoons?: unknown; metric?: unknown };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) continue;
    const spoons = readAmount(record.spoons) ?? readAmount(record);
    const metric = readAmount(record.metric);
    const amounts: PageAmount[] = [];
    if (spoons && metric && !sameAmount(spoons, metric)) {
      amounts.push({ ...spoons, system: 'spoons' }, { ...metric, system: 'metric' });
    } else if (spoons || metric) {
      const only = spoons ?? metric;
      if (only) amounts.push({ ...only, system: 'only' });
    }
    rows.push({ name, amounts });
  }
  return rows;
}

function pageInstructions(value: unknown): PublicInstruction[] {
  if (!Array.isArray(value)) return [];
  const steps: PublicInstruction[] = [];
  for (const item of value.slice(0, 80)) {
    if (!item || typeof item !== 'object') continue;
    const text = (item as { text?: unknown }).text;
    if (typeof text !== 'string') continue;
    const trimmed = text.trim();
    if (trimmed) steps.push({ text: trimmed });
  }
  return steps;
}

function pageLanguage(code: string | null): { lang: string; dir: 'ltr' | 'rtl' } {
  const lang = (code ?? 'en').toLowerCase().split('-')[0] ?? 'en';
  if (!/^[a-z]{2}$/.test(lang)) return { lang: 'en', dir: 'ltr' };
  return { lang, dir: RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr' };
}

function platformLabel(platform: string | null, originalUrl: string | null): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'tiktok') return 'TikTok';
  if (originalUrl) {
    try {
      return new URL(originalUrl).hostname.replace(/^www\./, '');
    } catch {
      return 'the original post';
    }
  }
  return 'the original post';
}

function formatMinutes(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function isoDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `PT${rest}M`;
  if (rest === 0) return `PT${hours}H`;
  return `PT${hours}H${rest}M`;
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

const PAGE_STYLE = `
:root {
  color-scheme: light;
  --bg: #F4F1F8;
  --card: #FFFFFF;
  --text: #2A2634;
  --muted: #6E6878;
  --line: #E4DEEE;
  --primary: #7B6B9A;
  --primary-soft: #E8E2F0;
  --accent: #6B849E;
  --shadow: 0 18px 50px rgba(80, 64, 110, 0.08);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 10% -10%, rgba(123, 107, 154, 0.16), transparent 60%),
    var(--bg);
  color: var(--text);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
}
a { color: var(--accent); }
button, input { font: inherit; }
.wrap { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 64px; }
.top, .foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 700; }
.brand svg { display: block; }
.card {
  margin-top: 22px;
  background: var(--card);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 28px;
  box-shadow: var(--shadow);
  padding: 28px 22px 22px;
}
h1 {
  margin: 0;
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-size: clamp(34px, 6vw, 52px);
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.meta, .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.chip, .tag {
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--primary-soft);
  color: var(--muted);
  font-size: 13px;
}
.original { margin-top: 14px; font-size: 14px; }
.tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 22px; }
.stepper, .switch, .modes { display: inline-flex; align-items: center; background: var(--bg); border-radius: 999px; padding: 4px; }
.stepper button, .modes button, .switch button, .cook-nav button, .cta {
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  min-width: 36px;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
}
.stepper strong { min-width: 1.5rem; text-align: center; }
.modes button[aria-pressed="true"], .switch button[aria-pressed="true"], .cta.primary, .cook-nav .next {
  background: var(--primary);
  color: white;
}
.servings-label { color: var(--muted); font-size: 13px; }
.panel { margin-top: 22px; }
.ing {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
  cursor: pointer;
}
.ing input { margin-top: 3px; accent-color: var(--primary); width: 18px; height: 18px; }
.ing .name { flex: 1; line-height: 1.4; }
.ing .qty { color: var(--primary); font-variant-numeric: tabular-nums; font-weight: 700; min-width: 4.5rem; }
.ing.done .name, .ing.done .qty { color: var(--muted); text-decoration: line-through; }
.step {
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.25;
  margin: 8px 0 0;
}
.step-count { color: var(--muted); font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; }
.cook-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 28px; }
.cook-nav button { background: var(--primary-soft); }
.dots { display: flex; gap: 6px; margin-top: 18px; }
.dots i { width: 8px; height: 8px; border-radius: 99px; background: var(--line); display: block; }
.dots i.on { background: var(--primary); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.cta { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; background: var(--primary-soft); }
.cta.primary { background: var(--primary); }
.note { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 18px 0 0; }
body[data-view="ingredients"] .cook,
body[data-view="cook"] .ingredients,
body[data-units="spoons"] [data-system="metric"],
body[data-units="metric"] [data-system="spoons"] { display: none; }
@media (max-width: 640px) {
  .card { padding: 22px 16px 16px; border-radius: 22px; }
}
`;

function shell(input: {
  title: string;
  description: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  canonical: string | null;
  indexable: boolean;
  bodyAttrs: string;
  main: string;
  script?: string;
}): string {
  const robots = input.indexable ? 'index, follow' : 'noindex, nofollow';
  const canonical = input.canonical
    ? `<link rel="canonical" href="${escapeHtml(input.canonical)}" />`
    : '';
  const script = input.script ? `<script>${input.script}</script>` : '';
  return `<!DOCTYPE html>
<html lang="${escapeHtml(input.lang)}" dir="${input.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <meta name="description" content="${escapeHtml(input.description)}" />
  <meta name="robots" content="${robots}" />
  ${canonical}
  <meta property="og:title" content="${escapeHtml(input.title)}" />
  <meta property="og:description" content="${escapeHtml(input.description)}" />
  <style>${PAGE_STYLE}</style>
</head>
<body ${input.bodyAttrs}>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="${PINCH_APP_ORIGIN}">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3Z" fill="#7B6B9A"/><circle cx="9.5" cy="7.5" r="1.5" fill="#FFFFFF" fill-opacity="0.55"/><circle cx="6.5" cy="11.5" r="1.5" fill="#FFFFFF" fill-opacity="0.45"/><circle cx="11.5" cy="12.5" r="1.5" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="16.5" cy="14.5" r="1.5" fill="#FFFFFF" fill-opacity="0.4"/><circle cx="11" cy="17.5" r="1.5" fill="#FFFFFF" fill-opacity="0.45"/></svg>
        Pinch
      </a>
    </header>
    ${input.main}
    <p class="note">Pinch wrote this from a public link. It is Pinch’s recipe, with the original post linked. The creator’s photo and video stay on that post.</p>
  </div>
  ${script}
</body>
</html>`;
}

function clientScript(slug: string): string {
  return `
${formatPublicAmount.toString()}
(function () {
  var slug = ${jsonForScript(slug)};
  var baseServings = Number(document.body.dataset.servings || '1');
  var servings = baseServings;
  var step = 0;
  var steps = Array.prototype.slice.call(document.querySelectorAll('.step'));
  var storageKey = 'pinch-public-recipe:' + slug;

  function scale() {
    var ratio = servings / baseServings;
    Array.prototype.forEach.call(document.querySelectorAll('[data-qty]'), function (el) {
      el.textContent = formatPublicAmount(Number(el.dataset.qty) * ratio, el.dataset.unit || '');
    });
    var label = document.getElementById('servings-count');
    if (label) label.textContent = String(servings);
    var calories = document.getElementById('calories');
    if (calories && calories.dataset.base) {
      calories.textContent = String(Math.max(1, Math.round(Number(calories.dataset.base) * ratio)));
    }
    var minus = document.getElementById('servings-minus');
    if (minus) minus.disabled = servings <= 1;
  }

  function showStep() {
    steps.forEach(function (el, index) {
      el.hidden = index !== step;
    });
    var count = document.getElementById('step-count');
    if (count) count.textContent = 'Step ' + (step + 1) + ' of ' + steps.length;
    Array.prototype.forEach.call(document.querySelectorAll('.dots i'), function (dot, index) {
      dot.className = index === step ? 'on' : '';
    });
    var prev = document.getElementById('step-prev');
    var next = document.getElementById('step-next');
    if (prev) prev.disabled = step === 0;
    if (next) next.disabled = step >= steps.length - 1;
  }

  function setPressed(id, pressed) {
    var button = document.getElementById(id);
    if (button) button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }

  document.body.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var action = target.closest('[data-action]');
    if (!action) return;
    var name = action.getAttribute('data-action');
    if (name === 'servings-dec') servings = Math.max(1, servings - 1);
    if (name === 'servings-inc') servings = Math.min(99, servings + 1);
    if (name === 'servings-dec' || name === 'servings-inc') scale();
    if (name === 'units-spoons' || name === 'units-metric') {
      document.body.dataset.units = name === 'units-metric' ? 'metric' : 'spoons';
      setPressed('units-spoons', name === 'units-spoons');
      setPressed('units-metric', name === 'units-metric');
    }
    if (name === 'view-ingredients' || name === 'view-cook') {
      document.body.dataset.view = name === 'view-cook' ? 'cook' : 'ingredients';
      setPressed('view-ingredients', name === 'view-ingredients');
      setPressed('view-cook', name === 'view-cook');
    }
    if (name === 'step-prev') step = Math.max(0, step - 1);
    if (name === 'step-next') step = Math.min(steps.length - 1, step + 1);
    if (name === 'step-prev' || name === 'step-next') showStep();
  });

  document.body.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    var row = target.closest('.ing');
    if (row) row.classList.toggle('done', target.checked);
    try {
      var checks = Array.prototype.map.call(document.querySelectorAll('.ing input'), function (box) {
        return box.checked ? '1' : '0';
      }).join('');
      sessionStorage.setItem(storageKey, checks);
    } catch (err) {}
  });

  document.addEventListener('keydown', function (event) {
    if (document.body.dataset.view !== 'cook') return;
    var forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    var back = document.documentElement.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) step = Math.min(steps.length - 1, step + 1);
    if (event.key === back) step = Math.max(0, step - 1);
    if (event.key === forward || event.key === back) showStep();
  });

  try {
    var saved = sessionStorage.getItem(storageKey) || '';
    Array.prototype.forEach.call(document.querySelectorAll('.ing input'), function (box, index) {
      box.checked = saved.charAt(index) === '1';
      var row = box.closest('.ing');
      if (row) row.classList.toggle('done', box.checked);
    });
  } catch (err) {}

  scale();
  if (steps.length) showStep();
})();
`;
}

export function buildPublicRecipePage(input: PublicRecipePageInput): PublicRecipeDocument {
  const origin = (input.origin ?? PUBLIC_RECIPE_ORIGIN).replace(/\/$/, '');
  const indexable = input.indexable === true;
  const language = pageLanguage(input.sourceLanguage);
  const ingredients = pageIngredients(input.ingredients);
  const instructions = pageInstructions(input.instructions);
  const servings = Number.isFinite(input.servings) && input.servings >= 1 ? Math.round(input.servings) : 1;
  const originalUrl = safeHttpUrl(input.originalUrl);
  const sourceName = platformLabel(input.platform, originalUrl);
  const title = input.title.trim() || 'Recipe';
  const canonical = `${origin}/${input.slug}`;
  const hubUrl = UUID_PATTERN.test(input.id) ? `${PINCH_APP_ORIGIN}/hub/${input.id}` : PINCH_APP_ORIGIN;
  const hasToggle = ingredients.some((item) => item.amounts.some((amount) => amount.system === 'metric'));
  const description = truncate(
    instructions[0]?.text || `Ingredients and steps for ${title}.`,
    155,
  );

  const chips = [
    input.estimatedTimeMinutes && input.estimatedTimeMinutes > 0
      ? `<span class="chip">${escapeHtml(formatMinutes(input.estimatedTimeMinutes))}</span>`
      : '',
    input.calories && input.calories > 0
      ? `<span class="chip"><span id="calories" data-base="${Math.round(input.calories)}">${Math.round(input.calories)}</span> kcal</span>`
      : '',
  ].join('');

  const tags = input.tags
    .filter((tag) => typeof tag === 'string' && tag.trim())
    .slice(0, 8)
    .map((tag) => `<span class="tag">${escapeHtml(tag.trim())}</span>`)
    .join('');

  const ingredientHtml = ingredients.length
    ? ingredients
        .map((item) => {
          const amounts = item.amounts
            .map((amount) => {
              const system = amount.system === 'only' ? '' : ` data-system="${amount.system}"`;
              return `<span class="qty"${system} data-qty="${amount.quantity}" data-unit="${escapeHtml(amount.unit)}">${escapeHtml(formatPublicAmount(amount.quantity, amount.unit))}</span>`;
            })
            .join('');
          return `<label class="ing"><input type="checkbox" /><span class="amounts">${amounts}</span><span class="name">${escapeHtml(item.name)}</span></label>`;
        })
        .join('')
    : '<p class="note">No ingredients on this card.</p>';

  const stepHtml = instructions.length
    ? instructions
        .map((item, index) => `<p class="step"${index === 0 ? '' : ' hidden'}>${escapeHtml(item.text)}</p>`)
        .join('')
    : '<p class="step">No steps on this card.</p>';

  const dots = instructions
    .map((_, index) => `<i${index === 0 ? ' class="on"' : ''}></i>`)
    .join('');

  const recipeLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    inLanguage: language.lang,
    recipeYield: `${servings} servings`,
    recipeIngredient: ingredients.map((item) => {
      const amount = item.amounts[0];
      return amount ? `${formatPublicAmount(amount.quantity, amount.unit)} ${item.name}` : item.name;
    }),
    recipeInstructions: instructions.map((item, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: item.text,
    })),
    ...(input.estimatedTimeMinutes && input.estimatedTimeMinutes > 0
      ? { totalTime: isoDuration(input.estimatedTimeMinutes) }
      : {}),
    ...(originalUrl ? { isBasedOn: originalUrl } : {}),
    url: canonical,
  };

  const main = `
    <article class="card">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">${chips}</div>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <p class="original">${
        originalUrl
          ? `Original on <a href="${escapeHtml(originalUrl)}" rel="noopener noreferrer">${escapeHtml(sourceName)}</a>.`
          : 'The original post is not available from this page.'
      }</p>
      <div class="tools">
        <div class="stepper" aria-label="Servings">
          <button id="servings-minus" type="button" data-action="servings-dec" aria-label="Fewer servings">−</button>
          <strong id="servings-count">${servings}</strong>
          <button id="servings-plus" type="button" data-action="servings-inc" aria-label="More servings">+</button>
        </div>
        <span class="servings-label">servings</span>
        ${
          hasToggle
            ? `<div class="switch" aria-label="Measurements">
                <button id="units-spoons" type="button" data-action="units-spoons" aria-pressed="true">Spoons</button>
                <button id="units-metric" type="button" data-action="units-metric" aria-pressed="false">Grams</button>
              </div>`
            : ''
        }
        <div class="modes" aria-label="Recipe view">
          <button id="view-ingredients" type="button" data-action="view-ingredients" aria-pressed="true">Ingredients</button>
          <button id="view-cook" type="button" data-action="view-cook" aria-pressed="false">Cook</button>
        </div>
      </div>
      <section class="panel ingredients" aria-label="Ingredients">${ingredientHtml}</section>
      <section class="panel cook" aria-label="Steps">
        <div class="step-count" id="step-count">Step 1 of ${Math.max(instructions.length, 1)}</div>
        ${stepHtml}
        <div class="dots">${dots}</div>
        <div class="cook-nav">
          <button id="step-prev" type="button" data-action="step-prev">Back</button>
          <button id="step-next" class="next" type="button" data-action="step-next">Next</button>
        </div>
      </section>
      <div class="actions">
        <a class="cta primary" href="${escapeHtml(hubUrl)}">Save in Pinch</a>
        <a class="cta" href="${PINCH_APP_STORE_URL}">Get the app</a>
      </div>
      <script type="application/ld+json">${jsonForScript(recipeLd)}</script>
    </article>`;

  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    indexable,
    cacheControl: 'public, max-age=3600',
    body: shell({
      title: `${title} · Pinch`,
      description,
      lang: language.lang,
      dir: language.dir,
      canonical,
      indexable,
      bodyAttrs: `data-view="ingredients" data-units="spoons" data-servings="${servings}"`,
      main,
      script: clientScript(input.slug),
    }),
  };
}

export function buildPublicRecipeHome(): PublicRecipeDocument {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    indexable: false,
    cacheControl: 'public, max-age=3600',
    body: shell({
      title: 'Pinch recipes',
      description: 'Recipes Pinch has written from public links.',
      lang: 'en',
      dir: 'ltr',
      canonical: null,
      indexable: false,
      bodyAttrs: '',
      main: `<article class="card"><h1>Recipes, written out.</h1><p class="original">Each page is a Pinch recipe from a public link, with the original post beside it.</p><div class="actions"><a class="cta primary" href="${PINCH_APP_ORIGIN}">Open Pinch</a></div></article>`,
    }),
  };
}

export function buildPublicRecipeNotFound(): PublicRecipeDocument {
  return {
    status: 404,
    contentType: 'text/html; charset=utf-8',
    indexable: false,
    cacheControl: 'public, max-age=300',
    body: shell({
      title: 'Recipe not found · Pinch',
      description: 'That Pinch recipe is not available.',
      lang: 'en',
      dir: 'ltr',
      canonical: null,
      indexable: false,
      bodyAttrs: '',
      main: `<article class="card"><h1>That recipe isn’t here.</h1><div class="actions"><a class="cta primary" href="${PINCH_APP_ORIGIN}">Open Pinch</a></div></article>`,
    }),
  };
}

export function buildRecipeRobots(origin: string, indexable: boolean): PublicRecipeDocument {
  const base = origin.replace(/\/$/, '');
  const body = indexable
    ? `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return {
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    indexable,
    cacheControl: 'public, max-age=3600',
    body,
  };
}

export function buildRecipeSitemap(
  origin: string,
  cards: Array<{ public_slug: string; updated_at?: string | null }>,
): PublicRecipeDocument {
  const base = origin.replace(/\/$/, '');
  const urls = cards
    .filter((card) => SLUG_PATTERN.test(card.public_slug))
    .map((card) => {
      const lastmod = card.updated_at ? `<lastmod>${escapeHtml(card.updated_at)}</lastmod>` : '';
      return `<url><loc>${escapeHtml(`${base}/${card.public_slug}`)}</loc>${lastmod}</url>`;
    })
    .join('');
  return {
    status: 200,
    contentType: 'application/xml; charset=utf-8',
    indexable: true,
    cacheControl: 'public, max-age=3600',
    body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
  };
}

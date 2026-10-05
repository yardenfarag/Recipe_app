// Server-rendered HTML for https://pinch-app.io/s/<token> (PIN-9).
// Pure functions only — no Cloudflare APIs — so vitest can cover them.

export const SITE_URL = 'https://pinch-app.io';
export const APP_STORE_URL = 'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';
const FALLBACK_IMAGE = `${SITE_URL}/icon.png`;

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
  tags?: string[];
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

function formatQuantity(quantity: number): string {
  return String(Math.round(quantity * 100) / 100);
}

export function formatIngredient(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, quantity, unit } = raw as IngredientLike;
  if (typeof name !== 'string' || !name.trim()) return null;
  const parts: string[] = [];
  if (typeof quantity === 'number' && quantity > 0) parts.push(formatQuantity(quantity));
  if (typeof unit === 'string' && unit.trim()) parts.push(unit.trim());
  parts.push(name.trim());
  return parts.join(' ');
}

function ingredientLines(recipe: SharedRecipe): string[] {
  if (!Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients.map(formatIngredient).filter((line): line is string => line !== null);
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

export function shareDescription(recipe: SharedRecipe): string {
  const facts: string[] = [];
  const time = minutes(recipe);
  if (time) facts.push(`${time} min`);
  const serves = servings(recipe);
  if (serves) facts.push(`serves ${serves}`);
  const ingredients = ingredientLines(recipe);
  if (ingredients.length) facts.push(`${ingredients.length} ingredients`);

  const platform = recipe.platform ? PLATFORM_NAMES[recipe.platform] : undefined;
  const lead = platform ? `A recipe saved from ${platform} with Pinch` : 'A recipe shared from Pinch';
  return facts.length ? `${lead} · ${facts.join(' · ')}.` : `${lead}.`;
}

export function recipeJsonLd(recipe: SharedRecipe, pageUrl: string): Record<string, unknown> {
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
    description: shareDescription(recipe),
    recipeIngredient: ingredientLines(recipe),
    recipeInstructions: steps.map((text) => ({ '@type': 'HowToStep', text })),
  };
  if (time) data.totalTime = `PT${time}M`;
  if (serves) data.recipeYield = `${serves} servings`;
  if (recipe.tags?.length) data.keywords = recipe.tags.join(', ');
  if (source) data.isBasedOn = source;
  return data;
}

const STYLES = `
:root{--bg:#f7f4ef;--text:#1c1917;--muted:#57534e;--accent:#b45309;--card:#fff;--border:#e7e5e4}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--text:#fafaf9;--muted:#a8a29e;--accent:#fbbf24;--card:#1c1917;--border:#292524}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:1.5rem 1.25rem 3rem}
.brand{color:var(--accent);font-weight:800;text-decoration:none;font-size:1.25rem}
h1{font-size:1.9rem;line-height:1.2;margin:1rem 0 .5rem;letter-spacing:-.02em}
h2{font-size:1.2rem;margin:2rem 0 .75rem}
.meta{color:var(--muted);margin:0}
.hero{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:16px;margin-top:1.25rem;background:var(--border)}
.actions{display:flex;flex-direction:column;gap:.75rem;margin-top:1.25rem}
.btn{display:flex;align-items:center;justify-content:center;border-radius:999px;padding:.85rem 1.25rem;font-weight:700;text-decoration:none;border:1px solid transparent}
.btn-primary{background:var(--accent);color:#fff}
.btn-secondary{color:var(--text);border-color:var(--border)}
ul,ol{padding-left:1.25rem;margin:0}
li{margin:.35rem 0}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1rem 1.25rem}
.source{margin-top:2rem;color:var(--muted);font-size:.95rem}
.source a{color:var(--accent)}
`;

function page(options: {
  title: string;
  description: string;
  canonical?: string;
  image: string;
  robots?: string;
  jsonLd?: Record<string, unknown>;
  body: string;
}): string {
  const { title, description, canonical, image, robots, jsonLd, body } = options;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${robots ? `<meta name="robots" content="${robots}" />` : ''}
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Pinch" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="${image === FALLBACK_IMAGE ? 'summary' : 'summary_large_image'}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="apple-itunes-app" content="app-id=6796310453" />
    ${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ''}
    <style>${STYLES}</style>
  </head>
  <body>
    <main>
      <a class="brand" href="/">Pinch</a>
${body}
    </main>
  </body>
</html>
`;
}

function actionButtons(token: string): string {
  const encoded = encodeURIComponent(token);
  return `      <div class="actions">
        <a class="btn btn-primary" href="pinch://s/${encoded}">Open in Pinch</a>
        <a class="btn btn-secondary" href="${APP_STORE_URL}">Download on the App Store</a>
        <a class="btn btn-secondary" href="/app/s/${encoded}">Continue in browser</a>
      </div>`;
}

export function renderSharePage(recipe: SharedRecipe, token: string): string {
  const pageUrl = `${SITE_URL}/s/${encodeURIComponent(token)}`;
  const description = shareDescription(recipe);
  const image = httpsUrl(recipe.image_url) ?? FALLBACK_IMAGE;
  const ingredients = ingredientLines(recipe);
  const steps = instructionSteps(recipe);
  const source = httpsUrl(recipe.original_url);
  const platform = recipe.platform ? PLATFORM_NAMES[recipe.platform] : undefined;

  const body = `      <h1>${escapeHtml(recipe.title)}</h1>
      <p class="meta">${escapeHtml(description)}</p>
      ${image !== FALLBACK_IMAGE ? `<img class="hero" src="${escapeHtml(image)}" alt="${escapeHtml(recipe.title)}" />` : ''}
${actionButtons(token)}
      ${
        ingredients.length
          ? `<h2>Ingredients</h2>
      <div class="card"><ul>${ingredients.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        steps.length
          ? `<h2>Steps</h2>
      <div class="card"><ol>${steps.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ol></div>`
          : ''
      }
      ${
        source
          ? `<p class="source">Original recipe${platform ? ` on ${platform}` : ''}: <a href="${escapeHtml(source)}" rel="nofollow noopener">${escapeHtml(new URL(source).hostname)}</a></p>`
          : ''
      }
      <script>
        // Best-effort: hand the link to the installed app.
        setTimeout(function () { window.location.href = 'pinch://s/${encodeURIComponent(token)}'; }, 400);
      </script>`;

  return page({
    title: `${recipe.title} · Pinch`,
    description,
    canonical: pageUrl,
    image,
    jsonLd: recipeJsonLd(recipe, pageUrl),
    body,
  });
}

export function renderNotFoundPage(): string {
  return page({
    title: 'Recipe not found · Pinch',
    description: 'This shared recipe link has expired or was removed.',
    image: FALLBACK_IMAGE,
    robots: 'noindex',
    body: `      <h1>This recipe isn’t available</h1>
      <p class="meta">The link may have been removed. Ask your friend to share it again.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/">Go to Pinch</a>
      </div>`,
  });
}

export function renderUnavailablePage(token: string): string {
  return page({
    title: 'Shared recipe · Pinch',
    description: 'Someone shared a recipe with you on Pinch.',
    image: FALLBACK_IMAGE,
    robots: 'noindex',
    body: `      <h1>Someone shared a recipe with you</h1>
      <p class="meta">We couldn’t load the preview right now. Open it in Pinch instead.</p>
${actionButtons(token)}`,
  });
}

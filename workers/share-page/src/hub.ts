// Public Hub recipe pages at pinch-app.io/r/<public_slug> (PIN-124): lookup, the thin-recipe
// rule, the recipe sitemap and IndexNow pings. Reads `recipe_cards` through PostgREST with the
// publishable key; RLS lets anyone read Hub cards, and only the server writes them (PIN-67).
// Nothing from a user's own library is ever read here.

import { hubPageUrl, type HubRecipe, SITE_URL } from './render';

export interface SupabaseEnv {
  SUPABASE_URL: string;
  /** Publishable/anon key — the same one shipped in the web bundle. */
  SUPABASE_KEY: string;
}

/**
 * `public_slug` is the Latin title plus the first 12 hex digits of the card id, or the digits
 * alone (`recipe_card_public_slug` in the database). The digits find the card even when the
 * title part is wrong or out of date.
 */
const SLUG_PATTERN = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([0-9a-f]{12})$/;

const PAGE_COLUMNS = [
  'id',
  'public_slug',
  'title',
  'original_url',
  'platform',
  'image_url',
  'ingredients',
  'instructions',
  'servings',
  'estimated_time_minutes',
  'tags',
  'source_language',
  'extraction_status',
  'created_at',
  'updated_at',
].join(',');

const LIST_COLUMNS = 'public_slug,ingredients,instructions,extraction_status,updated_at';

/** PostgREST returns at most 1000 rows a request. */
const PAGE_SIZE = 1000;
/** One sitemap file holds at most 50,000 URLs. */
const SITEMAP_LIMIT = 50_000;
/** Fewer ingredients than this reads as a partial extraction. */
const MIN_INGREDIENTS = 3;

export const INDEXNOW_KEY = '5db7262217236666588254ac2a0331e7';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export type HubLookup =
  | { status: 'ok'; recipe: HubRecipe }
  | { status: 'not_found' }
  | { status: 'error' };

/** The id range a slug's 12 hex digits stand for, or null for anything that isn't a slug. */
export function idRangeForSlug(slug: string): { from: string; to: string } | null {
  const hex = SLUG_PATTERN.exec(slug)?.[1];
  if (!hex) return null;
  const prefix = `${hex.slice(0, 8)}-${hex.slice(8, 12)}`;
  return { from: `${prefix}-0000-0000-000000000000`, to: `${prefix}-ffff-ffff-ffffffffffff` };
}

/**
 * Thin recipes get a page but stay out of search: a partial extraction, no steps, or only a
 * couple of ingredients is not a page anyone wants to land on from Google.
 */
export function isIndexable(recipe: Pick<HubRecipe, 'ingredients' | 'instructions' | 'extraction_status'>): boolean {
  if (recipe.extraction_status && recipe.extraction_status !== 'full') return false;
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter(
        (item) => item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string' && (item as { name: string }).name.trim(),
      )
    : [];
  const steps = Array.isArray(recipe.instructions)
    ? recipe.instructions.filter(
        (step) => step && typeof step === 'object' && typeof (step as { text?: unknown }).text === 'string' && (step as { text: string }).text.trim(),
      )
    : [];
  return ingredients.length >= MIN_INGREDIENTS && steps.length > 0;
}

function restUrl(env: SupabaseEnv, query: string): string | null {
  const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base || !env.SUPABASE_KEY) return null;
  return `${base}/rest/v1/recipe_cards?${query}`;
}

function restHeaders(env: SupabaseEnv): HeadersInit {
  return { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, Accept: 'application/json' };
}

/** Finds the card for a slug. The caller redirects when `recipe.public_slug` differs from the slug asked for. */
export async function fetchHubRecipe(env: SupabaseEnv, slug: string): Promise<HubLookup> {
  const range = idRangeForSlug(slug);
  if (!range) return { status: 'not_found' };
  const url = restUrl(
    env,
    `select=${PAGE_COLUMNS}&id=gte.${range.from}&id=lte.${range.to}&order=id&limit=2`,
  );
  if (!url) return { status: 'error' };
  try {
    const response = await fetch(url, { headers: restHeaders(env) });
    if (!response.ok) return { status: 'error' };
    const rows = (await response.json()) as HubRecipe[];
    if (!Array.isArray(rows)) return { status: 'error' };
    // Two cards sharing 12 hex digits is unlikely; the exact slug wins if it happens.
    const recipe = rows.find((row) => row.public_slug === slug) ?? rows[0];
    if (!recipe || typeof recipe.title !== 'string' || typeof recipe.public_slug !== 'string') {
      return { status: 'not_found' };
    }
    return { status: 'ok', recipe };
  } catch {
    return { status: 'error' };
  }
}

type ListedCard = Pick<HubRecipe, 'public_slug' | 'ingredients' | 'instructions' | 'extraction_status' | 'updated_at'>;

/** Every indexable Hub card, newest change first. `since` limits it to cards changed after that time. */
export async function fetchIndexableCards(env: SupabaseEnv, since?: Date): Promise<ListedCard[] | null> {
  const cards: ListedCard[] = [];
  const filter = since ? `&updated_at=gte.${since.toISOString()}` : '';
  for (let offset = 0; offset < SITEMAP_LIMIT; offset += PAGE_SIZE) {
    const url = restUrl(
      env,
      `select=${LIST_COLUMNS}&extraction_status=eq.full${filter}&order=updated_at.desc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    if (!url) return null;
    let rows: ListedCard[];
    try {
      const response = await fetch(url, { headers: restHeaders(env) });
      if (!response.ok) return null;
      rows = (await response.json()) as ListedCard[];
      if (!Array.isArray(rows)) return null;
    } catch {
      return null;
    }
    cards.push(...rows.filter(isIndexable));
    if (rows.length < PAGE_SIZE) break;
  }
  return cards.slice(0, SITEMAP_LIMIT);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function recipeSitemap(cards: ListedCard[]): string {
  const urls = cards
    .map((card) => {
      const lastmod = card.updated_at ? `\n    <lastmod>${escapeXml(card.updated_at.slice(0, 10))}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeXml(hubPageUrl(card))}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** Tells Bing and the other IndexNow engines about Hub pages that changed since `since`. */
export async function submitChangedRecipes(env: SupabaseEnv, since: Date): Promise<string> {
  const cards = await fetchIndexableCards(env, since);
  if (!cards) throw new Error('IndexNow: could not list Hub cards');
  if (cards.length === 0) return 'IndexNow: no changed recipes';
  const urls = cards.map(hubPageUrl);
  // IndexNow takes up to 10,000 URLs a request.
  for (let i = 0; i < urls.length; i += 10_000) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(i, i + 10_000),
      }),
    });
    // 200 = accepted, 202 = accepted while the key is still being checked.
    if (!response.ok) throw new Error(`IndexNow: ${response.status} ${await response.text()}`);
  }
  return `IndexNow: sent ${urls.length} recipe URL(s)`;
}

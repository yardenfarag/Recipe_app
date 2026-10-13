import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import {
  PUBLIC_RECIPE_COLUMNS,
  PUBLIC_RECIPE_ORIGIN,
  buildPublicRecipeHome,
  buildPublicRecipeNotFound,
  buildPublicRecipePage,
  buildRecipeRobots,
  buildRecipeSitemap,
  parsePublicRecipePath,
  publicRecipeHeaders,
  type PublicRecipeDocument,
} from '../_shared/publicRecipePage.ts';

interface CardRow {
  id: string;
  public_slug: string;
  title: string;
  original_url: string | null;
  platform: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories: number | null;
  estimated_time_minutes: number | null;
  tags: string[] | null;
  source_language: string | null;
  extraction_status: string;
}

function pageOrigin(): string {
  return (Deno.env.get('PUBLIC_RECIPE_ORIGIN') || PUBLIC_RECIPE_ORIGIN).replace(/\/$/, '');
}

function pagesAreIndexable(): boolean {
  return Deno.env.get('PUBLIC_RECIPE_INDEX') === 'true';
}

function respond(doc: PublicRecipeDocument, method: string): Response {
  const headers = publicRecipeHeaders(doc);
  if (method === 'HEAD') return new Response(null, { status: doc.status, headers });
  return new Response(doc.body, { status: doc.status, headers });
}

/**
 * GET /public-recipe/:slug
 * HTML for one Cooking Hub card. Photos and video are not included.
 * Indexing stays off until PUBLIC_RECIPE_INDEX=true.
 */
Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const route = parsePublicRecipePath(new URL(req.url).pathname);
  const origin = pageOrigin();
  const indexable = pagesAreIndexable();

  if (route.kind === 'home') return respond(buildPublicRecipeHome(), req.method);
  if (route.kind === 'robots') return respond(buildRecipeRobots(origin, indexable), req.method);
  if (route.kind === 'unknown') return respond(buildPublicRecipeNotFound(), req.method);

  const admin = createServiceSupabase();
  if (!admin) {
    return new Response('Recipe pages are not configured.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (route.kind === 'sitemap') {
    if (!indexable) return respond(buildPublicRecipeNotFound(), req.method);
    const { data, error } = await admin
      .from('recipe_cards')
      .select('public_slug, updated_at')
      .eq('extraction_status', 'full')
      .order('updated_at', { ascending: false })
      .limit(5000);
    if (error || !data) {
      return new Response('Could not list recipes.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return respond(
      buildRecipeSitemap(
        origin,
        data as Array<{ public_slug: string; updated_at?: string | null }>,
      ),
      req.method,
    );
  }

  const { data, error } = await admin
    .from('recipe_cards')
    .select(PUBLIC_RECIPE_COLUMNS)
    .eq('public_slug', route.slug)
    .maybeSingle();
  const card = data as CardRow | null;
  if (error || !card || card.extraction_status !== 'full') {
    return respond(buildPublicRecipeNotFound(), req.method);
  }

  return respond(
    buildPublicRecipePage({
      id: card.id,
      slug: card.public_slug,
      title: card.title,
      originalUrl: card.original_url,
      platform: card.platform,
      ingredients: card.ingredients,
      instructions: card.instructions,
      servings: card.servings,
      calories: card.calories,
      estimatedTimeMinutes: card.estimated_time_minutes,
      tags: card.tags ?? [],
      sourceLanguage: card.source_language,
      origin,
      indexable,
    }),
    req.method,
  );
});

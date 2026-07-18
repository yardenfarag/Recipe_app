import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { extractYouTubeId, needsThumbnailBackfill } from '../_shared/platform.ts';
import { resolveYouTubeThumbnailUrl } from '../_shared/youtube.ts';

const MAX_VIDEO_IDS = 20;

interface RequestBody {
  /** YouTube video ids needing thumbnail resolution. */
  videoIds?: string[];
  /** Saved recipe ids to update (authed users only). */
  recipeIds?: string[];
}

/**
 * POST { videoIds, recipeIds? } — backfill thumbnails for specific recipes.
 * POST { videoIds } (no user) — resolve-only for guest/local recipes.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody = {};
  try {
    if (req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const videoIds = normalizeVideoIds(body.videoIds);
  const recipeIds = normalizeRecipeIds(body.recipeIds);

  if (user) {
    try {
      const updated =
        videoIds.length > 0
          ? await backfillUserRecipesByVideoIds(supabase, videoIds, recipeIds)
          : [];
      return jsonResponse({ updated, thumbnails: {} });
    } catch (err) {
      console.error('backfill-thumbnails error:', err);
      return jsonResponse({ error: 'Could not backfill recipes' }, 500);
    }
  }

  if (videoIds.length === 0) {
    return jsonResponse({ error: 'Missing videoIds for guest backfill' }, 400);
  }

  const thumbnails = await resolveThumbnails(videoIds);
  return jsonResponse({ updated: [], thumbnails });
});

function normalizeVideoIds(videoIds: unknown): string[] {
  if (!Array.isArray(videoIds)) return [];
  return [
    ...new Set(
      videoIds.filter((id): id is string => typeof id === 'string' && id.length === 11),
    ),
  ].slice(0, MAX_VIDEO_IDS);
}

function normalizeRecipeIds(recipeIds: unknown): string[] {
  if (!Array.isArray(recipeIds)) return [];
  return [
    ...new Set(recipeIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ].slice(0, MAX_VIDEO_IDS);
}

async function backfillUserRecipesByVideoIds(
  supabase: ReturnType<typeof createClient>,
  videoIds: string[],
  recipeIds: string[],
): Promise<Array<{ id: string; image_url: string }>> {
  const videoIdSet = new Set(videoIds);
  const recipeIdSet = recipeIds.length > 0 ? new Set(recipeIds) : null;

  let query = supabase
    .from('recipes')
    .select('id, original_url, image_url')
    .eq('platform', 'youtube')
    .not('original_url', 'is', null);

  if (recipeIdSet) {
    query = query.in('id', [...recipeIdSet]);
  }

  const { data: recipes, error: fetchError } = await query;

  if (fetchError) {
    console.error('backfill-thumbnails fetch error:', fetchError);
    throw fetchError;
  }

  const updated: Array<{ id: string; image_url: string }> = [];

  for (const recipe of recipes ?? []) {
    if (recipeIdSet && !recipeIdSet.has(recipe.id)) continue;
    if (!needsThumbnailBackfill(recipe.image_url)) continue;

    const videoId = extractYouTubeId(recipe.original_url);
    if (!videoId || !videoIdSet.has(videoId)) continue;

    const image_url = await resolveYouTubeThumbnailUrl(videoId);
    if (image_url === recipe.image_url) continue;

    const { data, error } = await supabase
      .from('recipes')
      .update({ image_url })
      .eq('id', recipe.id)
      .select('id, image_url')
      .single();

    if (error) {
      console.error(`backfill-thumbnails update error (${recipe.id}):`, error);
      continue;
    }

    if (data) updated.push(data);
  }

  return updated;
}

async function resolveThumbnails(videoIds: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    videoIds.map(async (videoId) => [videoId, await resolveYouTubeThumbnailUrl(videoId)] as const),
  );
  return Object.fromEntries(entries);
}

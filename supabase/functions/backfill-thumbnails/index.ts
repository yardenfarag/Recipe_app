import { readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { createAuthedSupabase, type Db } from '../_shared/core/supabaseAdmin.ts';
import { extractYouTubeId, needsThumbnailBackfill, youTubeThumbnail } from '../_shared/extraction/platform.ts';
import { resolveYouTubeThumbnailUrl } from '../_shared/extraction/sources/youtube.ts';

const MAX_VIDEO_IDS = 20;

interface RequestBody {
  /** YouTube video ids needing thumbnail resolution. */
  videoIds?: string[];
  /** Saved recipe ids to update (authed users only). */
  recipeIds?: string[];
}

/**
 * POST { videoIds, recipeIds? } — backfill thumbnails for specific recipes.
 * POST { videoIds } (no user) — resolve-only for guest/local recipes. Guests get
 * YouTube's standard thumbnail URL without an API call, so an anonymous script
 * can't spend the YouTube quota that extraction depends on (PIN-54).
 *
 * The body is read before the Authorization header is checked, so the handler does both itself, in that order.
 */
handler(
  { name: 'backfill-thumbnails', auth: 'none', body: 'none', legacyErrorShape: true },
  async ({ req, fail }) => {
    const body = (await readBackfillBody(req)) as RequestBody;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw fail('authMissing');

    const supabase = createAuthedSupabase(authHeader);
    if (!supabase) throw fail('misconfigured');

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
        return { updated, thumbnails: {} };
      } catch (err) {
        console.error('backfill-thumbnails error:', err);
        throw HttpError.legacy(500, 'Could not backfill recipes');
      }
    }

    if (videoIds.length === 0) {
      throw HttpError.legacy(400, 'Missing videoIds for guest backfill');
    }

    const thumbnails = guestThumbnails(videoIds);
    return { updated: [], thumbnails };
  },
);

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
  supabase: Db,
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

    if (data?.image_url) updated.push({ id: data.id, image_url: data.image_url });
  }

  return updated;
}

function guestThumbnails(videoIds: string[]): Record<string, string> {
  return Object.fromEntries(videoIds.map((videoId) => [videoId, youTubeThumbnail(videoId)]));
}

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  detectPlatform,
  extractYouTubeId,
  LIVE_PLATFORMS,
  youTubeThumbnail,
} from '../_shared/platform.ts';
import { fetchYouTubeMeta } from '../_shared/youtube.ts';
import { extractRecipeWithGemini, GeminiRecipe } from '../_shared/gemini.ts';

// Response contract consumed by the app (mirrors ExtractionResult in ADR 004).
type ExtractionStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body.url ?? '').trim();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!url) {
    return jsonResponse({ error: 'Missing "url" in request body' }, 400);
  }

  const platform = detectPlatform(url);

  // ADR 003 — staged rollout: reject non-live platforms with a clear message.
  if (!LIVE_PLATFORMS.includes(platform)) {
    return jsonResponse({
      status: 'coming_soon' as ExtractionStatus,
      platform,
      message:
        platform === 'unknown'
          ? "We couldn't recognize that link. Try a YouTube video for now."
          : `${capitalize(platform)} support is coming soon — we're starting with YouTube.`,
    });
  }

  // YouTube path
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return jsonResponse({
      status: 'failed' as ExtractionStatus,
      platform,
      message: "That doesn't look like a valid YouTube video link.",
    });
  }

  try {
    const meta = await fetchYouTubeMeta(videoId);

    const gemini = await extractRecipeWithGemini({
      youtubeUrl: url,
      description: meta.description,
      topComments: meta.topComments,
    });

    const { status, missingFields } = classify(gemini);

    if (status === 'failed') {
      return jsonResponse({
        status,
        platform,
        message: "Couldn't find a recipe in this video. Try a different link.",
      });
    }

    const recipe = {
      title: gemini.title,
      original_url: url,
      platform,
      image_url: youTubeThumbnail(videoId),
      ingredients: gemini.ingredients,
      instructions: gemini.instructions,
      servings: gemini.servings > 0 ? gemini.servings : 1,
      calories: gemini.calories ?? null,
      estimated_time_minutes: gemini.estimated_time_minutes ?? null,
      cost_estimate: gemini.cost_estimate ?? null,
      effort_level: gemini.effort_level ?? null,
      extraction_status: status,
      missing_fields: missingFields,
    };

    return jsonResponse({ status, platform, recipe });
  } catch (err) {
    console.error('extract-recipe error:', err);
    return jsonResponse(
      {
        status: 'failed' as ExtractionStatus,
        platform,
        message: 'Something went wrong while reading the video. Please try again.',
      },
      500,
    );
  }
});

function classify(r: GeminiRecipe): {
  status: Exclude<ExtractionStatus, 'coming_soon'>;
  missingFields: string[];
} {
  const hasTitle = Boolean(r.found_recipe && r.title?.trim());
  const hasIngredients = r.ingredients?.length > 0;
  const hasInstructions = r.instructions?.length > 0;

  if (!hasTitle || (!hasIngredients && !hasInstructions)) {
    return { status: 'failed', missingFields: [] };
  }

  const missingFields: string[] = [];
  if (!hasIngredients) missingFields.push('ingredients');
  if (!hasInstructions) missingFields.push('instructions');
  if (r.calories == null) missingFields.push('calories');
  if (r.estimated_time_minutes == null) missingFields.push('estimated_time_minutes');
  if (!r.cost_estimate) missingFields.push('cost_estimate');
  if (!r.effort_level) missingFields.push('effort_level');

  // "full" needs title + ingredients + steps (ADR 004). Otherwise partial.
  const isFull = hasTitle && hasIngredients && hasInstructions;
  return { status: isFull ? 'full' : 'partial', missingFields };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const MAX_BODY_BYTES = 32_000;
const TOKEN_BYTES = 18;

type ShareAction = 'create' | 'get' | 'claim';

interface RequestBody {
  action?: ShareAction;
  recipe_id?: string;
  token?: string;
}

interface RecipeSnapshot {
  title: string;
  original_url?: string | null;
  platform?: string | null;
  image_url?: string | null;
  source_video_url?: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories?: number | null;
  estimated_time_minutes?: number | null;
  cost_estimate?: string | null;
  effort_level?: string | null;
  extraction_status: string;
  extraction_source?: string | null;
  tags?: string[] | null;
  missing_fields?: string[] | null;
  source_language?: string | null;
  calories_reasoning?: string | null;
  time_reasoning?: string | null;
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function snapshotFromRecipe(row: Record<string, unknown>): RecipeSnapshot {
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) throw new Error('Recipe is missing a title');

  return {
    title,
    original_url: typeof row.original_url === 'string' ? row.original_url : null,
    platform: typeof row.platform === 'string' ? row.platform : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    source_video_url: typeof row.source_video_url === 'string' ? row.source_video_url : null,
    ingredients: row.ingredients ?? [],
    instructions: row.instructions ?? [],
    servings: typeof row.servings === 'number' && row.servings >= 1 ? row.servings : 1,
    calories: typeof row.calories === 'number' ? row.calories : null,
    estimated_time_minutes:
      typeof row.estimated_time_minutes === 'number' ? row.estimated_time_minutes : null,
    cost_estimate: typeof row.cost_estimate === 'string' ? row.cost_estimate : null,
    effort_level: typeof row.effort_level === 'string' ? row.effort_level : null,
    extraction_status:
      typeof row.extraction_status === 'string' ? row.extraction_status : 'full',
    extraction_source: typeof row.extraction_source === 'string' ? row.extraction_source : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : null,
    missing_fields: Array.isArray(row.missing_fields) ? (row.missing_fields as string[]) : null,
    source_language: typeof row.source_language === 'string' ? row.source_language : 'en',
    calories_reasoning: typeof row.calories_reasoning === 'string' ? row.calories_reasoning : null,
    time_reasoning: typeof row.time_reasoning === 'string' ? row.time_reasoning : null,
  };
}

function publicSnapshot(snapshot: RecipeSnapshot) {
  return {
    title: snapshot.title,
    original_url: snapshot.original_url ?? undefined,
    platform: snapshot.platform ?? undefined,
    image_url: snapshot.image_url ?? undefined,
    source_video_url: snapshot.source_video_url ?? undefined,
    ingredients: snapshot.ingredients,
    instructions: snapshot.instructions,
    servings: snapshot.servings,
    calories: snapshot.calories ?? undefined,
    estimated_time_minutes: snapshot.estimated_time_minutes ?? undefined,
    cost_estimate: snapshot.cost_estimate ?? undefined,
    effort_level: snapshot.effort_level ?? undefined,
    extraction_status: snapshot.extraction_status,
    extraction_source: snapshot.extraction_source ?? undefined,
    tags: snapshot.tags ?? undefined,
    missing_fields: snapshot.missing_fields ?? undefined,
    source_language: snapshot.source_language ?? undefined,
  };
}

function insertRowFromSnapshot(userId: string, snapshot: RecipeSnapshot) {
  return {
    user_id: userId,
    title: snapshot.title,
    original_url: snapshot.original_url ?? null,
    platform: snapshot.platform ?? null,
    image_url: snapshot.image_url ?? null,
    source_video_url: snapshot.source_video_url ?? null,
    ingredients: snapshot.ingredients ?? [],
    instructions: snapshot.instructions ?? [],
    servings: snapshot.servings,
    calories: snapshot.calories ?? null,
    estimated_time_minutes: snapshot.estimated_time_minutes ?? null,
    cost_estimate: snapshot.cost_estimate ?? null,
    effort_level: snapshot.effort_level ?? null,
    extraction_status: snapshot.extraction_status || 'full',
    extraction_source: snapshot.extraction_source ?? null,
    tags: snapshot.tags ?? [],
    missing_fields: snapshot.missing_fields ?? null,
    source_language: snapshot.source_language ?? 'en',
    calories_reasoning: snapshot.calories_reasoning ?? null,
    time_reasoning: snapshot.time_reasoning ?? null,
    is_favorite: false,
    migrated_from_guest: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody;
  try {
    const raw = await req.text();
    if (!raw) return jsonResponse({ error: 'Invalid JSON body' }, 400);
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request payload is too large' }, 400);
    }
    body = JSON.parse(raw) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = body.action;
  if (action !== 'create' && action !== 'get' && action !== 'claim') {
    return jsonResponse({ error: 'Invalid action' }, 400);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server misconfigured' }, 500);

  if (action === 'get') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return jsonResponse({ error: 'Missing token' }, 400);

    const { data, error } = await admin
      .from('recipe_shares')
      .select('token, snapshot, revoked_at')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('recipe-share get failed:', error);
      return jsonResponse({ error: 'Could not load share' }, 500);
    }
    if (!data || data.revoked_at) {
      return jsonResponse({ error: 'Share not found', code: 'share_not_found' }, 404);
    }

    return jsonResponse({
      status: 'ok',
      token: data.token,
      recipe: publicSnapshot(data.snapshot as RecipeSnapshot),
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const authed = createAuthedSupabase(authHeader);
  if (!authed) return jsonResponse({ error: 'Server misconfigured' }, 500);

  const {
    data: { user },
    error: userError,
  } = await authed.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (action === 'create') {
    const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id.trim() : '';
    if (!recipeId || recipeId.startsWith('guest-')) {
      return jsonResponse({ error: 'A saved recipe is required to share' }, 400);
    }

    const { data: recipe, error: recipeError } = await authed
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .maybeSingle();

    if (recipeError) {
      console.error('recipe-share create lookup failed:', recipeError);
      return jsonResponse({ error: 'Could not load recipe' }, 500);
    }
    if (!recipe) {
      return jsonResponse({ error: 'Recipe not found', code: 'recipe_not_found' }, 404);
    }

    const { data: existing } = await admin
      .from('recipe_shares')
      .select('token')
      .eq('source_recipe_id', recipeId)
      .eq('created_by', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      return jsonResponse({ status: 'ok', token: existing.token, reused: true });
    }

    let snapshot: RecipeSnapshot;
    try {
      snapshot = snapshotFromRecipe(recipe as Record<string, unknown>);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Invalid recipe' },
        400,
      );
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateToken();
      const { error: insertError } = await admin.from('recipe_shares').insert({
        token,
        created_by: user.id,
        source_recipe_id: recipeId,
        snapshot,
      });

      if (!insertError) {
        return jsonResponse({ status: 'ok', token, reused: false });
      }
      if (insertError.code !== '23505') {
        console.error('recipe-share create insert failed:', insertError);
        return jsonResponse({ error: 'Could not create share' }, 500);
      }
    }

    return jsonResponse({ error: 'Could not create share' }, 500);
  }

  // claim
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!isNonEmptyString(token)) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const { data: share, error: shareError } = await admin
    .from('recipe_shares')
    .select('token, snapshot, revoked_at, claim_count')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    console.error('recipe-share claim load failed:', shareError);
    return jsonResponse({ error: 'Could not load share' }, 500);
  }
  if (!share || share.revoked_at) {
    return jsonResponse({ error: 'Share not found', code: 'share_not_found' }, 404);
  }

  const { data: priorClaim } = await admin
    .from('recipe_share_claims')
    .select('recipe_id')
    .eq('token', token)
    .eq('claimed_by', user.id)
    .maybeSingle();

  if (priorClaim?.recipe_id) {
    return jsonResponse({
      status: 'ok',
      recipe_id: priorClaim.recipe_id,
      already_claimed: true,
    });
  }

  const snapshot = share.snapshot as RecipeSnapshot;
  const originalUrl =
    typeof snapshot.original_url === 'string' && snapshot.original_url.trim()
      ? snapshot.original_url.trim()
      : null;

  if (originalUrl) {
    const { data: existingByUrl } = await admin
      .from('recipes')
      .select('id')
      .eq('user_id', user.id)
      .eq('original_url', originalUrl)
      .maybeSingle();

    if (existingByUrl?.id) {
      await admin.from('recipe_share_claims').upsert({
        token,
        claimed_by: user.id,
        recipe_id: existingByUrl.id,
      });
      return jsonResponse({
        status: 'ok',
        recipe_id: existingByUrl.id,
        already_claimed: true,
      });
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('recipes')
    .insert(insertRowFromSnapshot(user.id, snapshot))
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505' && originalUrl) {
      const { data: raced } = await admin
        .from('recipes')
        .select('id')
        .eq('user_id', user.id)
        .eq('original_url', originalUrl)
        .maybeSingle();
      if (raced?.id) {
        await admin.from('recipe_share_claims').upsert({
          token,
          claimed_by: user.id,
          recipe_id: raced.id,
        });
        return jsonResponse({
          status: 'ok',
          recipe_id: raced.id,
          already_claimed: true,
        });
      }
    }
    console.error('recipe-share claim insert failed:', insertError);
    return jsonResponse({ error: 'Could not save shared recipe' }, 500);
  }

  const { error: claimError } = await admin.from('recipe_share_claims').insert({
    token,
    claimed_by: user.id,
    recipe_id: inserted.id,
  });
  if (claimError && claimError.code !== '23505') {
    console.error('recipe-share claim row failed:', claimError);
  }

  const priorCount = typeof share.claim_count === 'number' ? share.claim_count : 0;
  await admin.from('recipe_shares').update({ claim_count: priorCount + 1 }).eq('token', token);

  return jsonResponse({
    status: 'ok',
    recipe_id: inserted.id,
    already_claimed: false,
  });
});

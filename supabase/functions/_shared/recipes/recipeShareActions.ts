/** recipe-share's `create` and `claim`. Failures keep the old `{ error, code }` bodies. */
import { HttpError } from '../core/httpError.ts';
import { type Db, toJson } from '../core/supabaseAdmin.ts';
import {
  generateToken,
  insertRowFromSnapshot,
  type RecipeSnapshot,
  snapshotFromRecipe,
} from './recipeShareSnapshot.ts';

const shareFailed = (error: string) => HttpError.legacy(500, error, { code: 'share_failed' });

/**
 * `create`: a link to one of the caller's saved recipes. Sharing again keeps the link and refreshes its copy.
 * `authed` reads the recipe under row level security, so only the owner can share it.
 */
export async function createShare(
  admin: Db,
  authed: Db,
  userId: string,
  recipeId: string,
): Promise<Record<string, unknown>> {
  if (!recipeId || recipeId.startsWith('guest-')) {
    throw HttpError.legacy(400, 'A saved recipe is required to share', { code: 'recipe_not_saved' });
  }

  const { data: recipe, error: recipeError } = await authed
    .from('recipes')
    .select('*')
    .eq('id', recipeId)
    .maybeSingle();

  if (recipeError) {
    console.error('recipe-share create lookup failed:', recipeError);
    throw shareFailed('Could not load recipe');
  }
  if (!recipe) throw HttpError.legacy(404, 'Recipe not found', { code: 'recipe_not_found' });

  const { data: existing } = await admin
    .from('recipe_shares')
    .select('token')
    .eq('source_recipe_id', recipeId)
    .eq('created_by', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let snapshot: RecipeSnapshot;
  try {
    snapshot = snapshotFromRecipe(recipe as Record<string, unknown>);
  } catch (err) {
    throw HttpError.legacy(400, err instanceof Error ? err.message : 'Invalid recipe', { code: 'recipe_invalid' });
  }

  // Sharing again keeps the same link but sends the recipe as it is now, edits included.
  if (existing?.token) {
    const { error: refreshError } = await admin
      .from('recipe_shares')
      .update({ snapshot: toJson(snapshot) })
      .eq('token', existing.token);
    if (refreshError) console.error('recipe-share snapshot refresh failed:', refreshError);
    return { status: 'ok', token: existing.token, reused: true };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const { error: insertError } = await admin.from('recipe_shares').insert({
      token,
      created_by: userId,
      source_recipe_id: recipeId,
      snapshot: toJson(snapshot),
    });

    if (!insertError) return { status: 'ok', token, reused: false };
    if (insertError.code !== '23505') {
      console.error('recipe-share create insert failed:', insertError);
      throw shareFailed('Could not create share');
    }
  }

  throw shareFailed('Could not create share');
}

/**
 * `claim`: saves a shared recipe to the caller's library, once. A second claim of the same link, or a
 * link to a recipe they already have (same source URL and origin), answers the copy they have.
 */
export async function claimShare(admin: Db, userId: string, token: string): Promise<Record<string, unknown>> {
  const { data: share, error: shareError } = await admin
    .from('recipe_shares')
    .select('token, snapshot, revoked_at, claim_count')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    console.error('recipe-share claim load failed:', shareError);
    throw HttpError.legacy(500, 'Could not load share', { code: 'share_unavailable' });
  }
  if (!share || share.revoked_at) {
    throw HttpError.legacy(404, 'Share not found', { code: 'share_not_found' });
  }

  const { data: priorClaim } = await admin
    .from('recipe_share_claims')
    .select('recipe_id')
    .eq('token', token)
    .eq('claimed_by', userId)
    .maybeSingle();

  if (priorClaim?.recipe_id) {
    return {
      status: 'ok',
      recipe_id: priorClaim.recipe_id,
      already_claimed: true,
    };
  }

  const snapshot = share.snapshot as unknown as RecipeSnapshot;
  const originalUrl =
    typeof snapshot.original_url === 'string' && snapshot.original_url.trim()
      ? snapshot.original_url.trim()
      : null;

  if (originalUrl) {
    const { data: existingRows } = await admin
      .from('recipes')
      .select('id, extraction_source')
      .eq('user_id', userId)
      .eq('original_url', originalUrl);
    const wantInvented = snapshot.extraction_source === 'invented';
    const existingByUrl = (existingRows ?? []).find(
      (row) => (row.extraction_source === 'invented') === wantInvented,
    );

    if (existingByUrl?.id) {
      await admin.from('recipe_share_claims').upsert({
        token,
        claimed_by: userId,
        recipe_id: existingByUrl.id,
      });
      return {
        status: 'ok',
        recipe_id: existingByUrl.id,
        already_claimed: true,
      };
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('recipes')
    .insert(insertRowFromSnapshot(userId, snapshot))
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505' && originalUrl) {
      const { data: racedRows } = await admin
        .from('recipes')
        .select('id, extraction_source')
        .eq('user_id', userId)
        .eq('original_url', originalUrl);
      const wantInvented = snapshot.extraction_source === 'invented';
      const raced = (racedRows ?? []).find(
        (row) => (row.extraction_source === 'invented') === wantInvented,
      );
      if (raced?.id) {
        await admin.from('recipe_share_claims').upsert({
          token,
          claimed_by: userId,
          recipe_id: raced.id,
        });
        return {
          status: 'ok',
          recipe_id: raced.id,
          already_claimed: true,
        };
      }
    }
    console.error('recipe-share claim insert failed:', insertError);
    throw HttpError.legacy(500, 'Could not save shared recipe', { code: 'claim_failed' });
  }

  const { error: claimError } = await admin.from('recipe_share_claims').insert({
    token,
    claimed_by: userId,
    recipe_id: inserted.id,
  });
  if (claimError && claimError.code !== '23505') {
    console.error('recipe-share claim row failed:', claimError);
  }

  const priorCount = typeof share.claim_count === 'number' ? share.claim_count : 0;
  await admin.from('recipe_shares').update({ claim_count: priorCount + 1 }).eq('token', token);

  return {
    status: 'ok',
    recipe_id: inserted.id,
    already_claimed: false,
  };
}

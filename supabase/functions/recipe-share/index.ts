import { handler, HttpError } from '../_shared/core/handler.ts';
import { createAuthedSupabase } from '../_shared/core/supabaseAdmin.ts';
import { claimShare, createShare } from '../_shared/recipes/recipeShareActions.ts';
import { parseShareRequest } from '../_shared/recipes/recipeShareRequest.ts';
import { publicSnapshot, type RecipeSnapshot } from '../_shared/recipes/recipeShareSnapshot.ts';

const failed = (status: number, error: string, code?: string) =>
  HttpError.legacy(status, error, code ? { code } : {});

const missingToken = failed(400, 'Missing token', 'share_not_found');
const shareFailed = (error: string) => failed(500, error, 'share_failed');

/**
 * POST { action: 'create' | 'get' | 'claim' | 'revoke' | 'status', recipe_id?, token? }
 *
 * Failures keep the old { error, code? } shape (ADR 024). Codes (the app's words for them are in
 * shared/lib/serverErrors.ts): server_misconfigured, auth_required, share_not_found, share_unavailable,
 * recipe_not_saved, recipe_not_found, recipe_invalid, share_failed, claim_failed. Bad requests have no code.
 *
 * `get` needs no sign-in (guests open shared links on the web). The others check sign-in after the body, as they
 * always did, so the wrapper does no auth.
 */
handler(
  {
    name: 'recipe-share',
    auth: 'none',
    body: 'text',
    legacyErrorShape: true,
    errors: {
      misconfigured: failed(500, 'Server misconfigured', 'server_misconfigured'),
      authMissing: failed(401, 'Missing Authorization header', 'auth_required'),
      authInvalid: failed(401, 'Unauthorized', 'auth_required'),
    },
    input: parseShareRequest,
  },
  async ({ req, input: body, admin, fail }) => {
    const action = body.action;

    if (action === 'get') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!token) throw missingToken;

      const { data, error } = await admin
        .from('recipe_shares')
        .select('token, snapshot, revoked_at')
        .eq('token', token)
        .maybeSingle();

      if (error) {
        console.error('recipe-share get failed:', error);
        throw failed(500, 'Could not load share', 'share_unavailable');
      }
      if (!data || data.revoked_at) throw failed(404, 'Share not found', 'share_not_found');

      return {
        status: 'ok',
        token: data.token,
        recipe: publicSnapshot(data.snapshot as unknown as RecipeSnapshot),
      };
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw fail('authMissing');
    const authed = createAuthedSupabase(authHeader);
    if (!authed) throw fail('misconfigured');
    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();
    if (userError || !user) throw fail('authInvalid');

    // Stops a link (by token) or every link to a recipe (by recipe_id). Only the
    // sharer can revoke; another user's token matches no rows.
    if (action === 'revoke') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id.trim() : '';
      if (!token && !recipeId) throw failed(400, 'Missing token or recipe_id');

      let query = admin
        .from('recipe_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('created_by', user.id)
        .is('revoked_at', null);
      query = token ? query.eq('token', token) : query.eq('source_recipe_id', recipeId);
      const { data, error } = await query.select('token');
      if (error) {
        console.error('recipe-share revoke failed:', error);
        throw shareFailed('Could not revoke share');
      }
      return { status: 'ok', revoked: data?.length ?? 0 };
    }

    // Whether the sharer has a live link for this recipe. Not called by the app today: kept with
    // `revoke` so a "Stop sharing" button can be added without backend work (PIN-110).
    if (action === 'status') {
      const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id.trim() : '';
      if (!recipeId) throw failed(400, 'Missing recipe_id');
      const { data, error } = await admin
        .from('recipe_shares')
        .select('token')
        .eq('created_by', user.id)
        .eq('source_recipe_id', recipeId)
        .is('revoked_at', null)
        .limit(1);
      if (error) {
        console.error('recipe-share status failed:', error);
        throw shareFailed('Could not load share status');
      }
      return { status: 'ok', shared: (data?.length ?? 0) > 0 };
    }

    if (action === 'create') {
      const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id.trim() : '';
      return await createShare(admin, authed, user.id, recipeId);
    }

    // claim
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) throw missingToken;
    return await claimShare(admin, user.id, token);
  },
);

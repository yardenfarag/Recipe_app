import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { revokeAppleCredentials } from '../_shared/appleRevoke.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const AVATAR_BUCKET = 'avatars';
const THUMBNAIL_BUCKET = 'recipe-thumbnails';
const MAX_BODY_BYTES = 4_000;

interface RequestBody {
  /** Fresh Sign in with Apple authorization code for token revoke (TN3194). */
  apple_authorization_code?: string;
}

/**
 * POST { apple_authorization_code? }
 * Deletes the caller's account: Apple revoke (best effort) → avatars and Snap
 * photos → personal rows that don't cascade → auth user. The cascade wipes
 * profiles, recipes, collections, shopping list, token ledger and shares.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const authed = createAuthedSupabase(authHeader);
  const admin = createServiceSupabase();
  if (!authed || !admin) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const {
    data: { user },
    error: userError,
  } = await authed.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: RequestBody = {};
  try {
    const raw = await req.text();
    if (raw) {
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'Request payload is too large' }, 400);
      }
      body = JSON.parse(raw) as RequestBody;
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const appleCode =
    typeof body.apple_authorization_code === 'string'
      ? body.apple_authorization_code.trim()
      : '';

  const hasAppleIdentity = (user.identities ?? []).some((id) => id.provider === 'apple');
  if (hasAppleIdentity) {
    await revokeAppleCredentials(appleCode || null);
  }

  // Remove avatar objects for this user (Storage is not cascaded by auth delete).
  try {
    const { data: files, error: listError } = await admin.storage.from(AVATAR_BUCKET).list('', {
      limit: 1000,
      search: user.id,
    });
    if (listError) {
      console.error('Avatar list failed:', listError);
    } else {
      const paths = (files ?? [])
        .map((f) => f.name)
        .filter((name) => name.startsWith(`${user.id}-`) || name.startsWith(`${user.id}.`));
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage.from(AVATAR_BUCKET).remove(paths);
        if (removeError) console.error('Avatar remove failed:', removeError);
      }
    }
  } catch (err) {
    console.error('Avatar cleanup error:', err);
  }

  await removeUserPhotos(admin, user.id);

  // Support tickets, feedback, analytics and webhook failures don't cascade.
  // Stop here if they can't be erased, so the user can retry.
  const { error: eraseError } = await admin.rpc('erase_user_personal_data', { p_user_id: user.id });
  if (eraseError) {
    console.error('erase_user_personal_data failed:', eraseError);
    return jsonResponse({ error: 'Could not delete account. Please try again.' }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('deleteUser failed:', deleteError);
    return jsonResponse({ error: 'Could not delete account. Please try again.' }, 500);
  }

  return jsonResponse({ ok: true });
});

/**
 * Snap/invent photos live at `photo/<user id>/…`. Older uploads sit directly
 * under `photo/`, so those are found through the user's recipes instead.
 */
async function removeUserPhotos(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  userId: string,
): Promise<void> {
  try {
    const paths = new Set<string>();

    const { data: files, error: listError } = await admin.storage
      .from(THUMBNAIL_BUCKET)
      .list(`photo/${userId}`, { limit: 1000 });
    if (listError) console.error('Photo list failed:', listError);
    for (const file of files ?? []) paths.add(`photo/${userId}/${file.name}`);

    const { data: recipes, error: recipeError } = await admin
      .from('recipes')
      .select('image_url')
      .eq('user_id', userId)
      .like('image_url', `%/${THUMBNAIL_BUCKET}/photo/%`);
    if (recipeError) console.error('Photo recipe lookup failed:', recipeError);
    for (const row of recipes ?? []) {
      const marker = `/${THUMBNAIL_BUCKET}/`;
      const url = typeof row.image_url === 'string' ? row.image_url : '';
      const path = url.slice(url.indexOf(marker) + marker.length).split('?')[0];
      if (path.startsWith('photo/')) paths.add(decodeURIComponent(path));
    }

    if (paths.size > 0) {
      const { error: removeError } = await admin.storage.from(THUMBNAIL_BUCKET).remove([...paths]);
      if (removeError) console.error('Photo remove failed:', removeError);
    }
  } catch (err) {
    console.error('Photo cleanup error:', err);
  }
}

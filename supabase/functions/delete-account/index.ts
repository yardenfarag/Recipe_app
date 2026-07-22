import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { revokeAppleCredentials } from '../_shared/appleRevoke.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const AVATAR_BUCKET = 'avatars';
const MAX_BODY_BYTES = 4_000;

interface RequestBody {
  /** Fresh Sign in with Apple authorization code for token revoke (TN3194). */
  apple_authorization_code?: string;
}

/**
 * POST { apple_authorization_code? }
 * Deletes the caller's account: avatars → Apple revoke (best effort) → auth user.
 * Cascades wipe profiles, recipes, collections, shopping list, token ledger.
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

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('deleteUser failed:', deleteError);
    return jsonResponse({ error: 'Could not delete account. Please try again.' }, 500);
  }

  return jsonResponse({ ok: true });
});

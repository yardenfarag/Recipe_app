import { serve } from '../_shared/core/observe.ts';
import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import { revokeAppleCredentials } from '../_shared/account/appleRevoke.ts';
import { deletePaymentCustomers } from '../_shared/account/paymentCustomers.ts';
import { removeUserPhotos } from '../_shared/account/userPhotos.ts';
import { createAuthedSupabase } from '../_shared/core/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';

const AVATAR_BUCKET = 'avatars';
const MAX_BODY_BYTES = 4_000;

interface RequestBody {
  /** Fresh Sign in with Apple authorization code for token revoke (TN3194). */
  apple_authorization_code?: string;
}

/**
 * POST { apple_authorization_code? }
 * Deletes the caller's account: Apple revoke (best effort) → avatars and the user's own Snap
 * photos → personal rows that don't cascade → auth user → the customer records at Polar and
 * RevenueCat (best effort). The cascade wipes profiles, recipes, collections, shopping list,
 * token ledger and shares.
 */
serve('delete-account', async (req) => {
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

  // The account is gone; now the buyer's record at Polar and RevenueCat (best effort).
  const customers = await deletePaymentCustomers(user.id);
  console.log('[delete-account] payment customers', customers);

  return jsonResponse({ ok: true });
});

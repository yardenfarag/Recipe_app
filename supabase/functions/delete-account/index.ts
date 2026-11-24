import { revokeAppleCredentials } from '../_shared/account/appleRevoke.ts';
import { deletePaymentCustomers } from '../_shared/account/paymentCustomers.ts';
import { removeUserPhotos } from '../_shared/account/userPhotos.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';

const AVATAR_BUCKET = 'avatars';
const MAX_BODY_BYTES = 4_000;

interface RequestBody {
  /** Fresh Sign in with Apple authorization code for token revoke (TN3194). */
  apple_authorization_code?: string;
}

/**
 * The body, read after sign-in is checked, as it always was: empty is `{}`, and only the real bytes count towards
 * the limit (there is no Content-Length check, which would come before sign-in). Like before, JSON that isn't an
 * object (`null`, say) makes the field read below throw, which is a 500.
 */
function parseBody(raw: unknown): RequestBody {
  const text = raw as string;
  if (!text) return {};
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw HttpError.legacy(400, 'Request payload is too large');
  }
  try {
    return JSON.parse(text) as RequestBody;
  } catch {
    throw HttpError.legacy(400, 'Invalid JSON body');
  }
}

const couldNotDelete = HttpError.legacy(500, 'Could not delete account. Please try again.');

/**
 * POST { apple_authorization_code? }
 * Deletes the caller's account: Apple revoke (best effort) → avatars and the user's own Snap
 * photos → personal rows that don't cascade → auth user → the customer records at Polar and
 * RevenueCat (best effort). The cascade wipes profiles, recipes, collections, shopping list,
 * token ledger and shares.
 */
handler(
  { name: 'delete-account', auth: 'user', body: 'text', legacyErrorShape: true, input: parseBody },
  async ({ input: body, user, admin }) => {
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
      throw couldNotDelete;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('deleteUser failed:', deleteError);
      throw couldNotDelete;
    }

    // The account is gone; now the buyer's record at Polar and RevenueCat (best effort).
    const customers = await deletePaymentCustomers(user.id);
    console.log('[delete-account] payment customers', customers);

    return { ok: true };
  },
);

import { jsonResponse } from '../_shared/cors.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const BUCKET = 'recipe-thumbnails';
const REMOVE_BATCH = 100;

/**
 * POST (from the pinch-sweep-orphan-photos cron job) with header
 * `x-sweep-secret`. Removes Snap photos that no recipe or share uses anymore;
 * orphan_photo_paths() decides which (PIN-54).
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server misconfigured' }, 500);

  const secret = req.headers.get('x-sweep-secret') ?? '';
  const { data: allowed, error: secretError } = await admin.rpc('photo_sweep_secret_matches', {
    p_secret: secret,
  });
  if (secretError) {
    console.error('[sweep-orphan-photos] secret check failed', secretError);
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  if (!secret || allowed !== true) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: paths, error: listError } = await admin.rpc('orphan_photo_paths', { p_limit: 500 });
  if (listError) {
    console.error('[sweep-orphan-photos] list failed', listError);
    return jsonResponse({ error: 'Could not list photos' }, 500);
  }

  const names = ((paths ?? []) as unknown[]).filter((p): p is string => typeof p === 'string');
  let removed = 0;
  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const batch = names.slice(i, i + REMOVE_BATCH);
    const { error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error('[sweep-orphan-photos] remove failed', { count: batch.length, message: error.message });
      continue;
    }
    removed += batch.length;
  }

  console.log('[sweep-orphan-photos] done', { found: names.length, removed });
  return jsonResponse({ found: names.length, removed });
});

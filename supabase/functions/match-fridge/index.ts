import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  currentUtcDate,
  refundDailyAiUsage,
  refundGuestDailyAiUsage,
  reserveDailyAiUsage,
  reserveGuestDailyAiUsage,
} from '../_shared/dailyAiUsage.ts';
import { matchFridgeToCatalog, type FridgeCatalogItem } from '../_shared/fridgeMatch.ts';
import {
  FRIDGE_MATCH_DAILY_LIMIT,
  GUEST_FRIDGE_MATCH_DAILY_LIMIT,
} from '../_shared/pricing.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

const MAX_BODY_BYTES = 2_200_000;
const MAX_CATALOG = 80;
const MAX_TITLE = 120;

interface RequestBody {
  image_base64?: string;
  imageBase64?: string;
  image_mime?: string;
  guest_install_id?: string;
  guestInstallId?: string;
  catalog?: FridgeCatalogItem[];
}

/**
 * POST { image_base64, catalog, guest_install_id? }
 * -> { status, matches?, message? }
 *
 * Free vision ranker over the user's saved recipes. Daily cap only.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (requestIsTooLarge(req, MAX_BODY_BYTES)) {
    return jsonResponse({ error: 'Request payload is too large' }, 400);
  }

  const started = Date.now();
  let body: RequestBody;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request payload is too large' }, 400);
    }
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const rawImage = body.image_base64 ?? body.imageBase64;
  let imageBase64: string | null = null;
  let imageMime = 'image/jpeg';
  if (typeof rawImage === 'string' && rawImage.trim().length > 80) {
    const trimmed = rawImage.trim();
    const dataUrl = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
      imageMime = dataUrl[1];
      imageBase64 = dataUrl[2];
    } else {
      imageBase64 = trimmed.replace(/\s/g, '');
      if (typeof body.image_mime === 'string' && body.image_mime.startsWith('image/')) {
        imageMime = body.image_mime;
      }
    }
  }
  if (!imageBase64 || imageBase64.length > 2_000_000) {
    return jsonResponse({ error: 'Missing or too-large image_base64' }, 400);
  }

  const catalog = sanitizeCatalog(body.catalog);
  if (catalog.length === 0) {
    return jsonResponse({
      status: 'ok',
      matches: [],
      code: 'empty_library',
    });
  }

  let guestInstallId: string | null = null;
  const rawInstall = body.guest_install_id ?? body.guestInstallId;
  if (typeof rawInstall === 'string' && rawInstall.trim().length >= 8) {
    guestInstallId = rawInstall.trim().slice(0, 128);
  }

  const admin = createServiceSupabase();
  const authHeader = req.headers.get('Authorization');
  const authed = authHeader ? createAuthedSupabase(authHeader) : null;
  const {
    data: { user },
  } = authed ? await authed.auth.getUser() : { data: { user: null } };
  const userId = user?.id ?? null;

  if (!admin) {
    return jsonResponse({ status: 'failed', code: 'metering_error', message: 'metering_error' }, 500);
  }
  if (!userId && !guestInstallId) {
    return jsonResponse(
      { status: 'failed', code: 'guest_id_required', message: 'guest_id_required' },
      401,
    );
  }

  const usageDate = currentUtcDate();
  const reserved = userId
    ? await reserveDailyAiUsage(admin, userId, 'fridge_match', FRIDGE_MATCH_DAILY_LIMIT, usageDate)
    : await reserveGuestDailyAiUsage(
        admin,
        guestInstallId!,
        'fridge_match',
        GUEST_FRIDGE_MATCH_DAILY_LIMIT,
        usageDate,
      );

  if (reserved === 'error') {
    return jsonResponse({ status: 'failed', code: 'metering_error', message: 'metering_error' }, 500);
  }
  if (reserved === 'limited') {
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'fridge_match',
      status: 'daily_limit',
      tokensCharged: 0,
      durationMs: Date.now() - started,
    });
    return jsonResponse(
      {
        status: 'failed',
        code: 'daily_limit',
        message: 'daily_limit',
      },
      429,
    );
  }

  try {
    const result = await matchFridgeToCatalog({
      imageBase64,
      mimeType: imageMime,
      catalog,
    });
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'fridge_match',
      status: 'ok',
      usages: result.usage ? [result.usage] : [],
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: { match_count: result.matches.length, catalog_size: catalog.length },
    });
    return jsonResponse({ status: 'ok', matches: result.matches });
  } catch (err) {
    console.error('[match-fridge] error', err);
    if (userId) {
      await refundDailyAiUsage(admin, userId, 'fridge_match', usageDate);
    } else if (guestInstallId) {
      await refundGuestDailyAiUsage(admin, guestInstallId, 'fridge_match', usageDate);
    }
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'fridge_match',
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    return jsonResponse(
      { status: 'failed', message: "Couldn't match that photo to your recipes." },
      500,
    );
  }
});

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function sanitizeCatalog(raw: FridgeCatalogItem[] | undefined): FridgeCatalogItem[] {
  if (!Array.isArray(raw)) return [];
  const dropIngredients = raw.length > MAX_CATALOG;
  return raw.slice(0, MAX_CATALOG).flatMap((row) => {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) return [];
    if (typeof row.title !== 'string' || !row.title.trim()) return [];
    const item: FridgeCatalogItem = {
      id: row.id.trim().slice(0, 80),
      title: row.title.trim().slice(0, MAX_TITLE),
    };
    if (!dropIngredients && Array.isArray(row.ingredientNames)) {
      item.ingredientNames = row.ingredientNames
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map((name) => name.trim().slice(0, 60))
        .slice(0, 12);
    }
    if (Array.isArray(row.tags)) {
      item.tags = row.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim().toLowerCase().slice(0, 40))
        .slice(0, 6);
    }
    if (typeof row.time === 'number' && Number.isFinite(row.time) && row.time > 0) {
      item.time = Math.round(row.time);
    }
    return [item];
  });
}

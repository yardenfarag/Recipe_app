import { handler } from '../_shared/core/handler.ts';
import { MAX_PHOTO_BODY_BYTES, parsePhoto } from '../_shared/pantry/photoInput.ts';
import { parseLanguage, parsePlace, parseScanId, scanOnePhoto } from '../_shared/pantry/recordScan.ts';

/**
 * POST { scan_id, place, language, image_base64 } -> { status: 'ok', photo }
 *
 * Reads one photo of a fridge, freezer or cupboard (PIN-181). The items are kept on the scan until the app saves
 * the list; the photo is not stored. A photo that isn't a kitchen comes back with quality 'not_kitchen', no items
 * and no use of the daily cap.
 * Failures: 400 invalid_photo | invalid_place | invalid_scan, 429 daily_limit, 502 scan_failed.
 */
handler(
  {
    name: 'scan-pantry',
    auth: 'user',
    maxBodyBytes: MAX_PHOTO_BODY_BYTES,
    input: (raw: unknown) => {
      const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return {
        scanId: parseScanId(body.scan_id),
        place: parsePlace(body.place),
        language: parseLanguage(body.language),
        photo: parsePhoto(body.image_base64),
      };
    },
  },
  async ({ input, user, admin, log }) => {
    const photo = await scanOnePhoto({
      admin,
      userId: user.id,
      ...input,
      fromPhone: false,
      logUsage: (event) => log.usage(event),
    });
    return { status: 'ok', photo };
  },
);
